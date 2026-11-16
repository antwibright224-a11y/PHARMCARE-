import { can, currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

function midnightInZone(timeZone: string, instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const part = (type: string) => Number(parts.find(x => x.type === type)?.value);
  const target = Date.UTC(part('year'), part('month') - 1, part('day'));
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const zoned = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const get = (name: string) => Number(zoned.find(x => x.type === name)?.value);
    const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    guess += target - shown;
  }
  return new Date(guess);
}

export async function GET() {
  const user = await currentUser();
  if (!user || !(await can(user, 'dashboard', 'read'))) return Response.json({ error: 'Permission denied' }, { status: user ? 403 : 401 });
  const [canReadSales, canReadInventory, canReadReports] = await Promise.all([
    can(user, 'sales', 'read'),
    can(user, 'inventory', 'read'),
    can(user, 'reports', 'read'),
  ]);
  const settings = await db.pharmacySettings.findUnique({ where: { id: 'default' } });
  const timezone = settings?.timezone ?? 'Africa/Accra';
  const from = midnightInZone(timezone);
  const to = new Date(from.getTime() + 86400000);
  const [sales, medicines, expiring, batches, recentSales, topItems, trendSales] = await Promise.all([
    canReadSales ? db.sale.aggregate({ where: { createdAt: { gte: from, lt: to } }, _sum: { total: true }, _count: true }) : null,
    canReadInventory ? db.medicine.findMany({ where: { archived: false }, include: { batches: { where: { expiryDate: { gt: from } }, select: { quantity: true } } } }) : [],
    canReadInventory ? db.batch.count({ where: { quantity: { gt: 0 }, expiryDate: { gte: from, lte: new Date(from.getTime() + (settings?.expiryAlertDays ?? 90) * 86400000) } } }) : 0,
    canReadInventory ? db.batch.findMany({ where: { quantity: { gt: 0 } }, select: { quantity: true, purchaseCost: true } }) : [],
    canReadSales ? db.sale.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } }, items: { include: { medicine: { select: { name: true } } } } } }) : [],
    canReadReports ? db.saleItem.groupBy({ by: ['medicineId'], where: { sale: { createdAt: { gte: new Date(from.getTime() - 6 * 86400000), lt: to } } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 5 }) : [],
    canReadSales ? db.sale.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { createdAt: true, total: true } }) : [],
  ]);
  const stock = medicines.map(m => ({ id: m.id, name: m.name, stock: m.batches.reduce((n, b) => n + b.quantity, 0), reorderLevel: m.reorderLevel }));
  const products = await db.medicine.findMany({ where: { id: { in: topItems.map(x => x.medicineId) } }, select: { id: true, name: true, category: true } });
  const productMap = new Map(products.map(p => [p.id, p]));
  const trend = Array.from({ length: 7 }, () => 0);
  for (const sale of trendSales) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(sale.createdAt));
    const index = Math.max(0, Math.min(6, Math.floor((hour - 8) / 2)));
    trend[index] += Number(sale.total);
  }
  return Response.json({ metrics: { salesCount: sales?._count ?? 0, revenue: sales?._sum.total ?? 0, lowStock: stock.filter(m => m.stock <= m.reorderLevel).length, expiring, inventoryValue: batches.reduce((sum, b) => sum + b.quantity * Number(b.purchaseCost), 0), units: batches.reduce((sum, b) => sum + b.quantity, 0) }, recentSales, topProducts: topItems.map(p => ({ ...productMap.get(p.medicineId), units: p._sum.quantity ?? 0 })), trend, timezone });
}
