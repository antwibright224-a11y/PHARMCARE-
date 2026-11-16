import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
const schema = z.object({ amount: z.number().positive(), method: z.enum(['CASH', 'MOBILE_MONEY', 'CARD', 'BANK_TRANSFER']), reference: z.string().max(120).optional() });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission('purchases', 'update'); if (response) return response;
  const key = request.headers.get('Idempotency-Key'); if (!key) return Response.json({ error: 'Idempotency-Key header is required' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: 'Invalid supplier payment' }, { status: 400 });
  const { id } = await context.params;
  try {
    const result = await db.$transaction(async tx => {
      const existing = await tx.supplierPayment.findUnique({ where: { idempotencyKey: key } });
      if (existing) return { payment: existing, replayed: true, outstanding: undefined as number | undefined };
      const purchase = await tx.purchaseOrder.findUnique({ where: { id }, include: { payments: true } }); if (!purchase) throw new Error('Purchase order not found');
      const paid = purchase.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      if (paid + parsed.data.amount > Number(purchase.total)) throw new Error('Payment exceeds outstanding balance');
      const payment = await tx.supplierPayment.create({ data: { purchaseId: id, ...parsed.data, idempotencyKey: key } });
      await tx.auditLog.create({ data: { actorId: user!.id, action: 'SUPPLIER_PAYMENT', entity: 'PurchaseOrder', entityId: id, changes: { amount: parsed.data.amount, method: parsed.data.method, reference: parsed.data.reference ?? '' } } });
      return { payment, replayed: false, outstanding: Number(purchase.total) - paid - parsed.data.amount };
    }, { isolationLevel: 'Serializable' });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not record supplier payment' }, { status: 400 }); }
}
