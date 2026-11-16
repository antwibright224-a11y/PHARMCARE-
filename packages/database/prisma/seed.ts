import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../../../apps/web/src/lib/password-crypto';

const prisma = new PrismaClient();
const demoPassword = process.env.DEMO_PASSWORD ?? 'PharmaCare2026!';

async function main() {
  const users = [
    ['Ama Mensah', 'admin@pharmacare.local', Role.SUPER_ADMIN],
    ['Kofi Asare', 'manager@pharmacare.local', Role.PHARMACY_MANAGER],
    ['Abena Owusu', 'pharmacist@pharmacare.local', Role.PHARMACIST],
    ['Yaw Boateng', 'cashier@pharmacare.local', Role.CASHIER],
    ['Esi Tetteh', 'inventory@pharmacare.local', Role.INVENTORY_MANAGER],
  ] as const;
  const passwordHash = await hashPassword(demoPassword);
  const savedUsers = [];
  for (const [name, email, role] of users) savedUsers.push(await prisma.user.upsert({ where: { email }, update: { name, role, disabled: false }, create: { name, email, role, passwordHash } }));
  await prisma.pharmacySettings.upsert({ where: { id: 'default' }, update: {}, create: { name: 'PharmaCare Osu', address: 'Oxford Street, Osu, Accra', phone: '+233 30 290 1122', email: 'hello@pharmacare.local', currency: 'GHS', timezone: 'Africa/Accra', taxRate: 0, expiryAlertDays: 90 } });
  const suppliers = [
    ['Ernest Chemists', 'Kwame Boateng', 'orders@ernestchemists.example', '+233 30 222 1001'],
    ['Kinapharma Ltd', 'Akosua Darko', 'supply@kinapharma.example', '+233 30 277 8300'],
    ['M&G Pharmaceuticals', 'Nana Yeboah', 'sales@mgpharma.example', '+233 24 555 0184'],
  ];
  for (const [name, contactName, email, phone] of suppliers) await prisma.supplier.upsert({ where: { id: `seed-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}` }, update: { contactName, email, phone }, create: { id: `seed-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`, name, contactName, email, phone, address: 'Accra, Ghana' } });
  const catalog = [
    { name: 'Amoxicillin 500mg Capsules', genericName: 'Amoxicillin', sku: 'AMX-500-CAP', barcode: '6154001000012', category: 'Antibiotics', dosageForm: 'Capsule', strength: '500mg', manufacturer: 'Ernest Chemists', prescriptionRequired: true, price: 45, cost: 28, qty: 68, reorder: 20, batch: 'AMX-2509-A', days: 480 },
    { name: 'Paracetamol 500mg Tablets', genericName: 'Paracetamol', sku: 'PCM-500-TAB', barcode: '6154001000029', category: 'Pain relief', dosageForm: 'Tablet', strength: '500mg', manufacturer: 'Kama Industries', prescriptionRequired: false, price: 12, cost: 6.5, qty: 148, reorder: 30, batch: 'PCM-2508-B', days: 540 },
    { name: 'Cetirizine 10mg Tablets', genericName: 'Cetirizine', sku: 'CTZ-10-TAB', barcode: '6154001000036', category: 'Allergy', dosageForm: 'Tablet', strength: '10mg', manufacturer: 'M&G Pharmaceuticals', prescriptionRequired: false, price: 28, cost: 16, qty: 4, reorder: 15, batch: 'CTZ-2510-C', days: 210 },
    { name: 'ORS Sachets', genericName: 'Oral rehydration salts', sku: 'ORS-SAC-01', barcode: '6154001000043', category: 'Rehydration', dosageForm: 'Sachet', strength: '21g', manufacturer: 'Kinapharma', prescriptionRequired: false, price: 8, cost: 4, qty: 212, reorder: 25, batch: 'ORS-2507-D', days: 330 },
    { name: 'Vitamin C 1000mg Tablets', genericName: 'Ascorbic acid', sku: 'VTC-1000-TAB', barcode: '6154001000050', category: 'Vitamins', dosageForm: 'Tablet', strength: '1000mg', manufacturer: 'M&G Pharmaceuticals', prescriptionRequired: false, price: 35, cost: 19, qty: 86, reorder: 18, batch: 'VTC-2506-E', days: 25 },
    { name: 'Ibuprofen 400mg Tablets', genericName: 'Ibuprofen', sku: 'IBU-400-TAB', barcode: '6154001000067', category: 'Pain relief', dosageForm: 'Tablet', strength: '400mg', manufacturer: 'Ernest Chemists', prescriptionRequired: false, price: 18, cost: 9.5, qty: 54, reorder: 20, batch: 'IBU-2511-F', days: 620 },
  ];
  const batches = [];
  for (const item of catalog) {
    const medicine = await prisma.medicine.upsert({ where: { sku: item.sku }, update: { name: item.name, sellingPrice: item.price, reorderLevel: item.reorder }, create: { name: item.name, genericName: item.genericName, sku: item.sku, barcode: item.barcode, category: item.category, dosageForm: item.dosageForm, strength: item.strength, manufacturer: item.manufacturer, prescriptionRequired: item.prescriptionRequired, sellingPrice: item.price, reorderLevel: item.reorder } });
    const batch = await prisma.batch.upsert({ where: { medicineId_batchNumber: { medicineId: medicine.id, batchNumber: item.batch } }, update: { sellingPrice: item.price, purchaseCost: item.cost }, create: { medicineId: medicine.id, batchNumber: item.batch, expiryDate: new Date(Date.now() + item.days * 86400000), purchaseCost: item.cost, sellingPrice: item.price, quantity: item.qty } });
    batches.push({ medicine, batch, item });
  }
  for (const { medicine, batch, item } of batches) {
    await prisma.stockMovement.upsert({ where: { id: `seed-movement-${item.sku}` }, update: {}, create: { id: `seed-movement-${item.sku}`, batchId: batch.id, type: 'PURCHASE', quantity: item.qty, reason: 'Opening stock', reference: 'SEED-OPENING', actorId: savedUsers[0].id } });
  }
  const amoxicillin = batches.find(x => x.item.sku === 'AMX-500-CAP')!;
  const paracetamol = batches.find(x => x.item.sku === 'PCM-500-TAB')!;
  const sales = [
    { receiptNumber: 'PC-SEED-001', idempotencyKey: 'seed-sale-001', user: savedUsers[3], lines: [{ data: amoxicillin, quantity: 1 }] },
    { receiptNumber: 'PC-SEED-002', idempotencyKey: 'seed-sale-002', user: savedUsers[3], lines: [{ data: paracetamol, quantity: 2 }, { data: amoxicillin, quantity: 1 }] },
  ];
  for (const [index, sample] of sales.entries()) {
    const subtotal = sample.lines.reduce((sum, line) => sum + line.quantity * line.data.item.price, 0);
    const costOfGoods = sample.lines.reduce((sum, line) => sum + line.quantity * line.data.item.cost, 0);
    await prisma.$transaction(async tx => {
      if (await tx.sale.findUnique({ where: { idempotencyKey: sample.idempotencyKey } })) return;
      const sale = await tx.sale.create({ data: { receiptNumber: sample.receiptNumber, idempotencyKey: sample.idempotencyKey, userId: sample.user.id, subtotal, discount: 0, tax: 0, total: subtotal, costOfGoods, createdAt: new Date(Date.now() - index * 45 * 60000), items: { create: sample.lines.map(line => ({ medicineId: line.data.medicine.id, batchId: line.data.batch.id, quantity: line.quantity, unitPrice: line.data.item.price, unitCost: line.data.item.cost })) }, payments: { create: [{ method: index === 0 ? 'CASH' : 'MOBILE_MONEY', amount: subtotal, reference: index === 0 ? '' : 'DEMO-MOMO-REF-001' }] } } });
      for (const line of sample.lines) {
        await tx.batch.update({ where: { id: line.data.batch.id }, data: { quantity: { decrement: line.quantity } } });
        await tx.stockMovement.create({ data: { batchId: line.data.batch.id, type: 'SALE', quantity: -line.quantity, reason: 'Demo point of sale', reference: sale.receiptNumber, actorId: sample.user.id } });
      }
    });
  }
  const ernest = await prisma.supplier.findFirstOrThrow({ where: { name: 'Ernest Chemists' } });
  const purchaseMedicine = batches.find(x => x.item.sku === 'IBU-400-TAB')!;
  await prisma.purchaseOrder.upsert({ where: { orderNumber: 'PO-SEED-001' }, update: {}, create: { orderNumber: 'PO-SEED-001', supplierId: ernest.id, status: 'ORDERED', total: 240, notes: 'Routine monthly replenishment', lines: { create: [{ medicineId: purchaseMedicine.medicine.id, quantity: 24, receivedQuantity: 0, unitCost: purchaseMedicine.item.cost }] }, payments: { create: [{ idempotencyKey: 'seed-supplier-payment-001', amount: 60, method: 'BANK_TRANSFER', reference: 'DEMO-SUPPLIER-REF-001' }] } } });
  await prisma.expense.upsert({ where: { idempotencyKey: 'seed-expense-rent-001' }, update: {}, create: { idempotencyKey: 'seed-expense-rent-001', category: 'Utilities', amount: 420, date: new Date(), note: 'Monthly electricity and water', paymentMethod: 'CASH' } });
  const notifications = [
    { id: 'seed-notice-low-stock', title: 'Low stock alert', message: 'Cetirizine 10mg has 4 units remaining.', type: 'LOW_STOCK' },
    { id: 'seed-notice-expiry', title: 'Expiry alert', message: 'Vitamin C 1000mg batch VTC-2506-E expires soon.', type: 'EXPIRY' },
  ];
  for (const notice of notifications) await prisma.notification.upsert({ where: { id: notice.id }, update: { title: notice.title, message: notice.message, type: notice.type }, create: notice });
  console.log(`Seeded ${savedUsers.length} role-based users, ${catalog.length} medicines and ${suppliers.length} suppliers.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
