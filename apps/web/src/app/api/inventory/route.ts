import { z } from 'zod';
import { can, currentUser, requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const user = await currentUser();
  if (!user || !(await can(user, 'inventory', 'read'))) return Response.json({ error: 'Permission denied' }, { status: user ? 403 : 401 });
  const batches = await db.batch.findMany({ where: { quantity: { gt: 0 } }, include: { medicine: { select: { name: true, sku: true, reorderLevel: true } } }, orderBy: { expiryDate: 'asc' } });
  return Response.json({ batches, movements: await db.stockMovement.findMany({ take: 100, include: { actor: { select: { name: true } }, batch: { include: { medicine: { select: { name: true, sku: true } } } } }, orderBy: { createdAt: 'desc' } }) });
}

const schema = z.object({ batchId: z.string().min(1), quantity: z.number().int().refine(n => n !== 0), reason: z.string().min(4).max(250) });
export async function POST(request: Request) {
  const { user, response } = await requirePermission('inventory', 'update'); if (response) return response;
  const key = request.headers.get('Idempotency-Key'); if (!key) return Response.json({ error: 'Idempotency-Key header is required' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid adjustment' }, { status: 400 });
  try {
    const result = await db.$transaction(async tx => {
      const replay = await tx.stockMovement.findUnique({ where: { idempotencyKey: key } });
      if (replay) return { batch: await tx.batch.findUniqueOrThrow({ where: { id: replay.batchId } }), replayed: true };
      const batch = await tx.batch.findUnique({ where: { id: parsed.data.batchId } });
      if (!batch) throw new Error('Batch not found');
      if (batch.quantity + parsed.data.quantity < 0) throw new Error('Adjustment would make stock negative');
      const delta = parsed.data.quantity;
      const updatedCount = await tx.batch.updateMany({ where: { id: batch.id, ...(delta < 0 ? { quantity: { gte: -delta } } : {}) }, data: { quantity: delta < 0 ? { decrement: -delta } : { increment: delta } } });
      if (!updatedCount.count) throw new Error('Stock changed or quantity would become negative');
      const updated = await tx.batch.findUniqueOrThrow({ where: { id: batch.id } });
      await tx.stockMovement.create({ data: { batchId: batch.id, quantity: parsed.data.quantity, type: 'ADJUSTMENT', reason: parsed.data.reason, actorId: user!.id, idempotencyKey: key } });
      await tx.auditLog.create({ data: { actorId: user!.id, action: 'STOCK_ADJUSTMENT', entity: 'Batch', entityId: batch.id, changes: { from: batch.quantity, to: updated.quantity, reason: parsed.data.reason } } });
      return { batch: updated, replayed: false };
    }, { isolationLevel: 'Serializable' });
    return Response.json(result);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not adjust stock' }, { status: 400 }); }
}
