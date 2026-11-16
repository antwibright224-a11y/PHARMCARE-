import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateFefo, calculateSale, receiveQuantity, returnQuantity } from '../src/inventory';
import { hasRolePermission } from '../src/permissions';
import { loginSchema, saleSchema, signupSchema } from '../src/schemas';
import { endOfDayInTimezone, startOfDayInTimezone } from '../src/time';

const now = new Date('2026-11-05T00:00:00Z');
test('FEFO allocation selects earliest expiry then moves to next batch', () => {
  const batches = [
    { id: 'later', quantity: 8, expiresAt: new Date('2027-08-01'), unitCost: 2, unitPrice: 4 },
    { id: 'earlier', quantity: 3, expiresAt: new Date('2027-02-01'), unitCost: 1, unitPrice: 3 },
  ];
  assert.deepEqual(allocateFefo(batches, 5, now).map(x => [x.batchId, x.quantity]), [['earlier', 3], ['later', 2]]);
});
test('FEFO rejects expired stock and insufficient eligible quantity', () => {
  assert.throws(() => allocateFefo([{ id: 'expired', quantity: 10, expiresAt: now, unitCost: 1, unitPrice: 2 }], 1, now), /Insufficient stock/);
});
test('sale calculation keeps revenue, tax and batch cost distinct', () => {
  assert.deepEqual(calculateSale([{ quantity: 2, unitPrice: 10, unitCost: 4 }], 2, 10), { subtotal: 20, discount: 2, tax: 1.8, total: 19.8, costOfGoods: 8 });
});
test('partial receiving retains outstanding quantity until complete', () => {
  assert.deepEqual(receiveQuantity(12, 5, 3), { receivedQuantity: 8, status: 'PARTIALLY_RECEIVED' });
  assert.deepEqual(receiveQuantity(12, 8, 4), { receivedQuantity: 12, status: 'RECEIVED' });
  assert.throws(() => receiveQuantity(12, 8, 5), /exceeds/);
});
test('partial returns cannot exceed original purchased quantity', () => {
  assert.equal(returnQuantity(5, 2, 2), 4);
  assert.throws(() => returnQuantity(5, 4, 2), /exceeds/);
});
test('role permissions distinguish cashiers from administrators', () => {
  assert.equal(hasRolePermission('CASHIER', 'sales', 'create'), true);
  assert.equal(hasRolePermission('CASHIER', 'users', 'update'), false);
  assert.equal(hasRolePermission('SUPER_ADMIN', 'users', 'update'), true);
  assert.equal(hasRolePermission('INVENTORY_MANAGER', 'purchases', 'read'), true);
  assert.equal(hasRolePermission('INVENTORY_MANAGER', 'sales', 'read'), false);
  assert.equal(hasRolePermission('PHARMACY_MANAGER', 'users', 'read'), true);
  assert.equal(hasRolePermission('PHARMACY_MANAGER', 'dashboard', 'read'), true);
  assert.equal(hasRolePermission('PHARMACIST', 'reports', 'read'), true);
  assert.equal(hasRolePermission('PHARMACIST', 'users', 'read'), false);
});
test('authentication credentials and split payments validate server-side', () => {
  assert.equal(loginSchema.safeParse({ email: 'worker@example.test', password: 'secret' }).success, true);
  assert.equal(loginSchema.safeParse({ email: 'not-an-email', password: '' }).success, false);
  assert.deepEqual(signupSchema.parse({ name: ' New User ', email: 'NEW@EXAMPLE.TEST ', password: 'correct horse battery staple', requestedRole: 'CASHIER' }), { name: 'New User', email: 'new@example.test', password: 'correct horse battery staple', requestedRole: 'CASHIER' });
  assert.equal(signupSchema.safeParse({ name: 'A', email: 'bad-email', password: 'short', requestedRole: 'CASHIER' }).success, false);
  assert.equal(signupSchema.safeParse({ name: 'New User', email: 'new@example.test', password: 'long-enough-password', requestedRole: 'ROOT' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'worker@example.test', password: 'secret', verificationMethod: 'email' }).success, true);
  assert.equal(saleSchema.safeParse({ items: [{ medicineId: 'm1', quantity: 1 }], paymentMethod: 'SPLIT' }).success, false);
  assert.equal(saleSchema.safeParse({ items: [{ medicineId: 'm1', quantity: 1 }], paymentMethod: 'SPLIT', payments: [{ method: 'CASH', amount: 5 }, { method: 'MOBILE_MONEY', amount: 5 }] }).success, true);
});
test('date range boundaries respect the configured pharmacy timezone', () => {
  assert.equal(startOfDayInTimezone('2026-11-05', 'Africa/Accra').toISOString(), '2026-11-05T00:00:00.000Z');
  assert.equal(startOfDayInTimezone('2026-11-05', 'America/New_York').toISOString(), '2026-11-05T05:00:00.000Z');
  assert.equal(endOfDayInTimezone('2026-11-01', 'America/New_York').toISOString(), '2026-11-02T04:59:59.999Z');
});
