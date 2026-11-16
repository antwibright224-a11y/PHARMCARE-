import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';

const testUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL prevents concurrent overselling and duplicate sale insertion', { skip: !testUrl }, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: testUrl! } } });
  const suffix = randomUUID(); const email = `${suffix}@test.pharmacare.invalid`; const sku = `TEST-${suffix}`;
  let userId = ''; let medicineId = '';
  const batchIds: string[] = []; const keys: string[] = [];
  try {
    const user = await prisma.user.create({ data: { name: 'Integration Test', email, passwordHash: 'unused', role: 'SUPER_ADMIN' } }); userId = user.id;
    const medicine = await prisma.medicine.create({ data: { name: 'Concurrency Test Item', sku, category: 'Test', dosageForm: 'Tablet', strength: '1mg', sellingPrice: 1, reorderLevel: 0 } }); medicineId = medicine.id;
    const batch = await prisma.batch.create({ data: { medicineId, batchNumber: `B-${suffix}`, expiryDate: new Date(Date.now() + 86400000 * 30), purchaseCost: 0.5, sellingPrice: 1, quantity: 1 } }); batchIds.push(batch.id);
    async function checkout(idempotencyKey: string, id: string) {
      return prisma.$transaction(async tx => {
        const old = await tx.sale.findUnique({ where: { idempotencyKey } }); if (old) return old;
        const locked = await tx.$queryRaw<{ id: string; quantity: number }[]>`SELECT id, quantity FROM "Batch" WHERE id = ${id} AND quantity > 0 AND "expiryDate" > NOW() FOR UPDATE`;
        if (!locked.length) throw new Error('Insufficient stock');
        const updated = await tx.batch.updateMany({ where: { id, quantity: { gte: 1 } }, data: { quantity: { decrement: 1 } } });
        if (!updated.count) throw new Error('Insufficient stock');
        return tx.sale.create({ data: { receiptNumber: `TEST-${randomUUID()}`, userId, subtotal: 1, discount: 0, tax: 0, total: 1, costOfGoods: new Prisma.Decimal('0.5'), idempotencyKey } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
    const overSaleKeys = [randomUUID(), randomUUID()]; keys.push(...overSaleKeys);
    const competing = await Promise.allSettled(overSaleKeys.map(key => checkout(key, batch.id)));
    assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).quantity, 0);
    assert.equal(await prisma.sale.count({ where: { idempotencyKey: { in: overSaleKeys } } }), 1);

    const duplicateBatch = await prisma.batch.create({ data: { medicineId, batchNumber: `B2-${suffix}`, expiryDate: new Date(Date.now() + 86400000 * 30), purchaseCost: 0.5, sellingPrice: 1, quantity: 2 } }); batchIds.push(duplicateBatch.id);
    const duplicateKey = randomUUID(); keys.push(duplicateKey);
    await Promise.allSettled([checkout(duplicateKey, duplicateBatch.id), checkout(duplicateKey, duplicateBatch.id)]);
    assert.equal(await prisma.sale.count({ where: { idempotencyKey: duplicateKey } }), 1);
    assert.equal((await prisma.batch.findUniqueOrThrow({ where: { id: duplicateBatch.id } })).quantity, 1);
  } finally {
    await prisma.sale.deleteMany({ where: { idempotencyKey: { in: keys } } });
    await prisma.batch.deleteMany({ where: { id: { in: batchIds } } });
    if (medicineId) await prisma.medicine.delete({ where: { id: medicineId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
