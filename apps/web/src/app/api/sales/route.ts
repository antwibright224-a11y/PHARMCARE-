import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { allocateFefo, saleSchema } from '@pharmacare/shared';
import { can, currentUser, requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const user = await currentUser();
  if (!user || !(await can(user, 'sales', 'read'))) return Response.json({ error: 'Authentication required' }, { status: user ? 403 : 401 });
  const sales = await db.sale.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } }, items: { include: { medicine: { select: { name: true } } } } } });
  return Response.json({ sales });
}

export async function POST(request: Request) {
  const { user, response } = await requirePermission('sales', 'create'); if (response) return response;
  const key = request.headers.get('Idempotency-Key');
  if (!key || key.length > 100) return Response.json({ error: 'Idempotency-Key header is required' }, { status: 400 });
  const parsed = saleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid sale details' }, { status: 400 });
  try {
    const sale = await db.$transaction(async tx => {
      const existing = await tx.sale.findUnique({ where: { idempotencyKey: key }, include: { items: { include: { medicine: { select: { name: true } } } }, user: { select: { name: true } } } });
      if (existing) return existing;
      const settings = await tx.pharmacySettings.findUnique({ where: { id: 'default' } });
      const grouped = new Map<string, number>();
      for (const line of parsed.data.items) grouped.set(line.medicineId, (grouped.get(line.medicineId) ?? 0) + line.quantity);
      const allocations: { medicineId: string; batchId: string; quantity: number; unitCost: Prisma.Decimal; unitPrice: Prisma.Decimal }[] = [];
      let subtotal = new Prisma.Decimal(0); let cost = new Prisma.Decimal(0);
      for (const [medicineId, requested] of grouped) {
        const medicine = await tx.medicine.findUnique({ where: { id: medicineId } });
        if (!medicine || medicine.archived) throw new Error('Medicine is unavailable');
        if (medicine.prescriptionRequired && !parsed.data.prescriptionReference) throw new Error(`Prescription reference required for ${medicine.name}`);
        const batches = await tx.$queryRaw<{ id: string; quantity: number; expiryDate: Date; receivedAt: Date; purchaseCost: Prisma.Decimal; sellingPrice: Prisma.Decimal }[]>`
          SELECT id, quantity, "expiryDate", "receivedAt", "purchaseCost", "sellingPrice" FROM "Batch"
          WHERE "medicineId" = ${medicineId} AND quantity > 0 AND "expiryDate" > NOW()
          ORDER BY "expiryDate" ASC, "receivedAt" ASC FOR UPDATE`;
        const available = batches.reduce((sum, batch) => sum + batch.quantity, 0);
        let fefo;
        try { fefo = allocateFefo(batches.map(batch => ({ id: batch.id, quantity: batch.quantity, expiresAt: batch.expiryDate, receivedAt: batch.receivedAt })), requested); }
        catch { throw new Error(`Insufficient stock for ${medicine.name} (${available} available)`); }
        for (const allocation of fefo) {
          const batch = batches.find(item => item.id === allocation.batchId)!;
          const unitPrice = batch.sellingPrice ?? medicine.sellingPrice;
          allocations.push({ medicineId, batchId: batch.id, quantity: allocation.quantity, unitCost: batch.purchaseCost, unitPrice });
          subtotal = subtotal.add(unitPrice.mul(allocation.quantity)); cost = cost.add(batch.purchaseCost.mul(allocation.quantity));
        }
      }
      const discount = new Prisma.Decimal(parsed.data.discount);
      if (discount.greaterThan(subtotal)) throw new Error('Discount cannot exceed subtotal');
      if (!discount.isZero() && user!.role !== 'SUPER_ADMIN' && user!.role !== 'PHARMACY_MANAGER') throw new Error('You are not authorized to apply a discount');
      const tax = subtotal.sub(discount).mul(settings?.taxRate ?? 0).div(100).toDecimalPlaces(2);
      const total = subtotal.sub(discount).add(tax);
      const paymentLines = parsed.data.paymentMethod === 'SPLIT' ? parsed.data.payments! : [{ method: parsed.data.paymentMethod, amount: total.toNumber(), reference: parsed.data.paymentReference }];
      const paid = paymentLines.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      if (!paid.equals(total)) throw new Error('Payment amounts must match the sale total exactly');
      const created = await tx.sale.create({ data: { receiptNumber: `PC-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`, userId: user!.id, subtotal, discount, tax, total, costOfGoods: cost, idempotencyKey: key, prescriptionReference: parsed.data.prescriptionReference, items: { create: allocations.map(a => ({ medicineId: a.medicineId, batchId: a.batchId, quantity: a.quantity, unitPrice: a.unitPrice, unitCost: a.unitCost })) }, payments: { create: paymentLines.map(payment => ({ method: payment.method, amount: payment.amount, reference: payment.reference })) } } });
      for (const allocation of allocations) {
        const changed = await tx.batch.updateMany({ where: { id: allocation.batchId, quantity: { gte: allocation.quantity } }, data: { quantity: { decrement: allocation.quantity } } });
        if (!changed.count) throw new Error('Stock changed during checkout; please retry');
        await tx.stockMovement.create({ data: { batchId: allocation.batchId, type: 'SALE', quantity: -allocation.quantity, reason: 'Point of sale', reference: created.receiptNumber, actorId: user!.id } });
      }
      await tx.auditLog.create({ data: { actorId: user!.id, action: 'SALE', entity: 'Sale', entityId: created.id, changes: { total: total.toString(), items: allocations.length } } });
      return tx.sale.findUniqueOrThrow({ where: { id: created.id }, include: { user: { select: { name: true } }, items: { include: { medicine: { select: { name: true } } } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
    return Response.json({ sale }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      const existing = await db.sale.findUnique({ where: { idempotencyKey: key }, include: { user: { select: { name: true } }, items: { include: { medicine: { select: { name: true } } } } } });
      if (existing) return Response.json({ sale: existing, replayed: true });
    }
    const message = error instanceof Error ? error.message : 'Could not complete sale';
    if (message.includes('Transaction') || message.includes('serialization')) return Response.json({ error: 'Inventory changed during checkout. Please retry.' }, { status: 409 });
    return Response.json({ error: message }, { status: 400 });
  }
}
