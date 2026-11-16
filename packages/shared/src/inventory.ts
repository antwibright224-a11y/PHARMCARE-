export type StockBatch = { id: string; quantity: number; expiresAt: Date; receivedAt?: Date; unitCost?: number; unitPrice?: number };
export type BatchAllocation = { batchId: string; quantity: number; unitCost?: number; unitPrice?: number };

export function allocateFefo(batches: StockBatch[], requested: number, now = new Date()): BatchAllocation[] {
  if (!Number.isInteger(requested) || requested < 1) throw new Error('Quantity must be a positive whole number');
  const eligible = batches.filter(batch => batch.quantity > 0 && batch.expiresAt.getTime() > now.getTime()).sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() || (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
  const available = eligible.reduce((sum, batch) => sum + batch.quantity, 0);
  if (available < requested) throw new Error(`Insufficient stock (${available} available)`);
  let remaining = requested;
  const allocations: BatchAllocation[] = [];
  for (const batch of eligible) {
    if (!remaining) break;
    const quantity = Math.min(remaining, batch.quantity);
    allocations.push({ batchId: batch.id, quantity, unitCost: batch.unitCost, unitPrice: batch.unitPrice });
    remaining -= quantity;
  }
  return allocations;
}

export function calculateSale(lines: { quantity: number; unitPrice: number; unitCost: number }[], discount: number, taxRate: number) {
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  if (discount < 0 || discount > subtotal) throw new Error('Discount cannot exceed subtotal');
  const tax = Math.round((subtotal - discount) * taxRate) / 100;
  return { subtotal, discount, tax, total: subtotal - discount + tax, costOfGoods: lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0) };
}

export function receiveQuantity(ordered: number, received: number, newReceipt: number) {
  if (newReceipt < 1 || received + newReceipt > ordered) throw new Error('Received quantity exceeds ordered quantity');
  const total = received + newReceipt;
  return { receivedQuantity: total, status: total === ordered ? 'RECEIVED' as const : 'PARTIALLY_RECEIVED' as const };
}

export function returnQuantity(sold: number, alreadyReturned: number, requested: number) {
  if (requested < 1 || alreadyReturned + requested > sold) throw new Error('Return quantity exceeds purchased quantity');
  return alreadyReturned + requested;
}
