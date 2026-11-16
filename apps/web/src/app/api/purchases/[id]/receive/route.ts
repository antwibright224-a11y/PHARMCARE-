import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
const schema = z.object({ lines: z.array(z.object({ purchaseLineId: z.string().min(1), quantity: z.number().int().positive(), batchNumber: z.string().min(1).max(80), expiryDate: z.coerce.date(), purchaseCost: z.number().nonnegative(), sellingPrice: z.number().nonnegative() })).min(1) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission('purchases', 'update'); if (response) return response;
  const key = request.headers.get('Idempotency-Key'); if (!key) return Response.json({ error: 'Idempotency-Key header is required' }, { status: 400 });
  const { id } = await context.params; const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid receipt' }, { status: 400 });
  if (parsed.data.lines.some(line => line.expiryDate <= new Date())) return Response.json({ error: 'Received batches must have an expiry date in the future' }, { status: 400 });
  try {
    const result = await db.$transaction(async tx => {
      const seen = await tx.purchaseReceipt.findUnique({ where: { idempotencyKey: key } });
      if (seen) {
        if (seen.purchaseId !== id) throw new Error('Idempotency key was already used for another purchase order');
        return { purchase: await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } }), replayed: true };
      }
      const order = await tx.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
      if (!order || order.status === 'CANCELLED' || order.status === 'DRAFT') throw new Error('This purchase order cannot receive goods');
      for (const receipt of parsed.data.lines) {
        const line = order.lines.find(l => l.id === receipt.purchaseLineId);
        if (!line || line.receivedQuantity + receipt.quantity > line.quantity) throw new Error('Received quantity exceeds the outstanding purchase quantity');
        const previousBatch = await tx.batch.findUnique({ where: { medicineId_batchNumber: { medicineId: line.medicineId, batchNumber: receipt.batchNumber } } });
        if (previousBatch) {
          if (previousBatch.expiryDate.getTime() !== receipt.expiryDate.getTime() || Number(previousBatch.purchaseCost) !== receipt.purchaseCost || Number(previousBatch.sellingPrice) !== receipt.sellingPrice) throw new Error('Batch number already exists with different expiry or prices');
          await tx.batch.update({ where: { id: previousBatch.id }, data: { quantity: { increment: receipt.quantity } } });
        } else {
          await tx.batch.create({ data: { medicineId: line.medicineId, batchNumber: receipt.batchNumber, expiryDate: receipt.expiryDate, purchaseCost: receipt.purchaseCost, sellingPrice: receipt.sellingPrice, quantity: receipt.quantity } });
        }
        await tx.purchaseLine.update({ where: { id: line.id }, data: { receivedQuantity: { increment: receipt.quantity } } });
      }
      const updatedLines = await tx.purchaseLine.findMany({ where: { purchaseId: id } });
      const fullyReceived = updatedLines.every(line => line.receivedQuantity === line.quantity);
      const purchase = await tx.purchaseOrder.update({ where: { id }, data: { status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' }, include: { lines: true } });
      await tx.purchaseReceipt.create({ data: { purchaseId: id, idempotencyKey: key } });
      for (const receipt of parsed.data.lines) {
        const line = order.lines.find(l => l.id === receipt.purchaseLineId)!;
        const batch = await tx.batch.findUniqueOrThrow({ where: { medicineId_batchNumber: { medicineId: line.medicineId, batchNumber: receipt.batchNumber } } });
        await tx.stockMovement.create({ data: { batchId: batch.id, type: 'PURCHASE', quantity: receipt.quantity, reason: 'Purchase order receipt', reference: order.orderNumber, actorId: user!.id } });
      }
      await tx.notification.create({ data: { title: 'Goods received', message: `Goods were received for ${order.orderNumber}.`, type: 'PURCHASE_RECEIVED' } });
      await tx.auditLog.create({ data: { actorId: user!.id, action: 'RECEIVE', entity: 'PurchaseOrder', entityId: id, changes: { receivedLines: parsed.data.lines.length } } });
      return { purchase, replayed: false };
    }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
    return Response.json(result);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not receive purchase' }, { status: 400 }); }
}
