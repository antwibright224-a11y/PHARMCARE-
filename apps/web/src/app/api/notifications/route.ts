import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
export async function GET() {
  const user = await currentUser(); if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  const settings = await db.pharmacySettings.findUnique({ where: { id: 'default' } });
  const [saved, medicines, expiring] = await Promise.all([
    db.notification.findMany({ take: 30, orderBy: { createdAt: 'desc' } }),
    db.medicine.findMany({ where: { archived: false }, include: { batches: { where: { expiryDate: { gt: new Date() } }, select: { quantity: true } } } }),
    db.batch.findMany({ where: { quantity: { gt: 0 }, expiryDate: { gt: new Date(), lte: new Date(Date.now() + (settings?.expiryAlertDays ?? 90) * 86400000) } }, include: { medicine: { select: { name: true } } }, take: 30, orderBy: { expiryDate: 'asc' } }),
  ]);
  const lowStock = medicines.filter(m => m.batches.reduce((sum, b) => sum + b.quantity, 0) <= m.reorderLevel).map(m => ({ id: `low-${m.id}`, title: 'Low stock', message: `${m.name} is at or below its reorder level.`, type: 'LOW_STOCK', createdAt: new Date() }));
  const expiryAlerts = expiring.map(batch => ({ id: `expiry-${batch.id}`, title: 'Expiry alert', message: `${batch.medicine.name}, batch ${batch.batchNumber}, expires ${batch.expiryDate.toLocaleDateString('en-GH')}.`, type: 'EXPIRY', createdAt: new Date() }));
  return Response.json({ notifications: [...lowStock, ...expiryAlerts, ...saved] });
}
