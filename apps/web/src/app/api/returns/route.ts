import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
const schema = z.object({ saleId: z.string().min(1), reason: z.string().min(4).max(250), refundAmount: z.number().nonnegative(), items: z.array(z.object({ saleItemId: z.string().min(1), quantity: z.number().int().positive(), disposition: z.enum(['RESTOCK', 'DAMAGED', 'EXPIRED']) })).min(1) });
export async function POST(request: Request) {
  const { user, response } = await requirePermission('returns', 'create'); if (response) return response;
  const key = request.headers.get('Idempotency-Key'); if (!key) return Response.json({ error: 'Idempotency-Key header is required' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid return details' }, { status: 400 });
  try {
    const result = await db.$transaction(async tx => {
      const existing = await tx.saleReturn.findUnique({ where: { idempotencyKey: key } }); if (existing) return { saleReturn: existing, replayed: true };
      const sale = await tx.sale.findUnique({ where: { id: parsed.data.saleId } }); if (!sale) throw new Error('Original sale not found');
      const soldItems = []; let maximumRefund = new Prisma.Decimal(0);
      for (const item of parsed.data.items) {
        const sold = await tx.saleItem.findUnique({ where: { id: item.saleItemId } });
        if (!sold || sold.saleId !== sale.id) throw new Error('Returned item is not part of the original sale');
        const alreadyReturned = await tx.returnItem.aggregate({ where: { saleItemId: sold.id }, _sum: { quantity: true } });
        if ((alreadyReturned._sum.quantity ?? 0) + item.quantity > sold.quantity) throw new Error('Return quantity exceeds quantity originally purchased');
        if (!sale.subtotal.isZero()) maximumRefund = maximumRefund.add(sold.unitPrice.mul(item.quantity).mul(sale.total).div(sale.subtotal));
        soldItems.push({ sold, item });
      }
      maximumRefund = maximumRefund.toDecimalPlaces(2);
      if (new Prisma.Decimal(parsed.data.refundAmount).toDecimalPlaces(2).greaterThan(maximumRefund)) throw new Error('Refund exceeds the value of the returned items');
      const saleReturn = await tx.saleReturn.create({ data: { saleId: sale.id, reason: parsed.data.reason, refundAmount: parsed.data.refundAmount, idempotencyKey: key, items: { create: parsed.data.items } } });
      for (const { sold, item } of soldItems) {
        if (item.disposition === 'RESTOCK') {
          const batch = await tx.batch.findUniqueOrThrow({ where: { id: sold.batchId } });
          if (batch.expiryDate <= new Date()) throw new Error('Expired stock cannot be returned to sellable inventory');
          await tx.batch.update({ where: { id: batch.id }, data: { quantity: { increment: item.quantity } } });
        }
        await tx.stockMovement.create({ data: { batchId: sold.batchId, type: item.disposition === 'RESTOCK' ? 'RETURN' : 'WRITE_OFF', quantity: item.disposition === 'RESTOCK' ? item.quantity : 0, reason: `${item.disposition}: ${parsed.data.reason}`, reference: sale.receiptNumber, actorId: user!.id } });
      }
      await tx.auditLog.create({ data: { actorId: user!.id, action: 'RETURN', entity: 'SaleReturn', entityId: saleReturn.id, changes: { saleId: sale.id, itemCount: parsed.data.items.length, refundAmount: parsed.data.refundAmount } } });
      return { saleReturn, replayed: false };
    }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not process return' }, { status: 400 }); }
}
