import { randomBytes } from 'node:crypto';
import { purchaseOrderSchema } from '@pharmacare/shared';
import { can, currentUser, requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
export async function GET() {
  const user = await currentUser();
  if (!user || !(await can(user, 'purchases', 'read'))) return Response.json({ error: 'Permission denied' }, { status: user ? 403 : 401 });
  return Response.json({ purchases: await db.purchaseOrder.findMany({ include: { supplier: true, lines: { include: { medicine: true } }, payments: true }, orderBy: { createdAt: 'desc' } }) });
}
export async function POST(request: Request) {
  const { user, response } = await requirePermission('purchases', 'create'); if (response) return response;
  const key = request.headers.get('Idempotency-Key'); if (!key) return Response.json({ error: 'Idempotency-Key header is required' }, { status: 400 });
  const parsed = purchaseOrderSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid purchase order' }, { status: 400 });
  const existing = await db.purchaseOrder.findUnique({ where: { idempotencyKey: key } }); if (existing) return Response.json({ purchase: existing, replayed: true });
  const total = parsed.data.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  try {
    const purchase = await db.$transaction(async tx => {
      const order = await tx.purchaseOrder.create({ data: { orderNumber: `PO-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`, supplierId: parsed.data.supplierId, notes: parsed.data.notes, status: 'ORDERED', total, idempotencyKey: key, lines: { create: parsed.data.lines } }, include: { supplier: true, lines: true } });
      await tx.auditLog.create({ data: { actorId: user!.id, action: 'CREATE', entity: 'PurchaseOrder', entityId: order.id, changes: { orderNumber: order.orderNumber, total } } });
      return order;
    });
    return Response.json({ purchase }, { status: 201 });
  } catch { return Response.json({ error: 'Supplier, medicine or request key is invalid' }, { status: 409 }); }
}
