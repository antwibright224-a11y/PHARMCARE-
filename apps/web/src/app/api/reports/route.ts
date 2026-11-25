import { can, currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { endOfDayInTimezone, startOfDayInTimezone } from '@pharmacare/shared';

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !(await can(user, 'reports', 'read'))) return Response.json({ error: 'Permission denied' }, { status: user ? 403 : 401 });
  const params = new URL(request.url).searchParams;
  const fromValue = params.get('from'); const toValue = params.get('to');
  const settings = await db.pharmacySettings.findUnique({ where: { id: 'default' } }); const timezone = settings?.timezone ?? 'Africa/Accra';
  const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const localToday = `${todayParts.find(part => part.type === 'year')?.value}-${todayParts.find(part => part.type === 'month')?.value}-${todayParts.find(part => part.type === 'day')?.value}`;
  const from = fromValue ? (fromValue.length === 10 ? startOfDayInTimezone(fromValue, timezone) : new Date(fromValue)) : startOfDayInTimezone(localToday, timezone);
  const to = toValue ? (toValue.length === 10 ? endOfDayInTimezone(toValue, timezone) : new Date(toValue)) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return Response.json({ error: 'Invalid date range' }, { status: 400 });
  const [saleAgg, expenseAgg, inventory, expiring, topItems] = await Promise.all([
    db.sale.aggregate({ where: { createdAt: { gte: from, lte: to } }, _sum: { total: true, costOfGoods: true, discount: true, tax: true }, _count: true }),
    db.expense.aggregate({ where: { date: { gte: from, lte: to } }, _sum: { amount: true }, _count: true }),
    db.batch.findMany({ where: { quantity: { gt: 0 } }, select: { quantity: true, purchaseCost: true, sellingPrice: true } }),
    db.batch.findMany({ where: { quantity: { gt: 0 }, expiryDate: { gte: new Date(), lte: new Date(Date.now() + (settings?.expiryAlertDays ?? 90) * 86400000) } }, include: { medicine: { select: { name: true, sku: true } } }, orderBy: { expiryDate: 'asc' } }),
    db.saleItem.groupBy({ by: ['medicineId'], where: { sale: { createdAt: { gte: from, lte: to } } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 10 }),
  ]);
  const medicines = await db.medicine.findMany({ where: { id: { in: topItems.map(x => x.medicineId) } }, select: { id: true, name: true, sku: true } });
  const byId = new Map(medicines.map(m => [m.id, m]));
  const revenue = Number(saleAgg._sum.total ?? 0); const cogs = Number(saleAgg._sum.costOfGoods ?? 0); const expenseTotal = Number(expenseAgg._sum.amount ?? 0);
  const report = { period: { from, to }, sales: { count: saleAgg._count, revenue, discounts: Number(saleAgg._sum.discount ?? 0), tax: Number(saleAgg._sum.tax ?? 0), costOfGoods: cogs, grossProfit: revenue - cogs }, expenses: { count: expenseAgg._count, total: expenseTotal }, netAfterExpenses: revenue - cogs - expenseTotal, inventory: { units: inventory.reduce((n, b) => n + b.quantity, 0), costValue: inventory.reduce((n, b) => n + b.quantity * Number(b.purchaseCost), 0), retailValue: inventory.reduce((n, b) => n + b.quantity * Number(b.sellingPrice), 0) }, expiring: expiring.map(b => ({ medicine: b.medicine.name, sku: b.medicine.sku, batchNumber: b.batchNumber, expiryDate: b.expiryDate, quantity: b.quantity })), topProducts: topItems.map(i => ({ ...(byId.get(i.medicineId) ?? {}), units: i._sum.quantity ?? 0 })) };
  if (params.get('format') === 'csv') {
    const rows = [['Report', `Amount (${settings?.currency ?? 'GHS'})`], ['Revenue', revenue.toFixed(2)], ['Cost of goods sold', cogs.toFixed(2)], ['Gross profit', (revenue - cogs).toFixed(2)], ['Expenses', expenseTotal.toFixed(2)], ['Net after expenses', (revenue - cogs - expenseTotal).toFixed(2)]];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="pharmacare-report-${from.toISOString().slice(0, 10)}.csv"` } });
  }
  return Response.json({ report });
}
