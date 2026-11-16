import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
export async function GET() {
  const { response } = await requirePermission('settings', 'read'); if (response) return response;
  const settings = await db.pharmacySettings.upsert({ where: { id: 'default' }, update: {}, create: {} });
  return Response.json({ settings });
}
const schema = z.object({ name: z.string().min(2).max(150), logoUrl: z.union([z.url(), z.literal('')]), address: z.string().max(250), phone: z.string().max(50), email: z.union([z.email(), z.literal('')]), receiptFooter: z.string().max(250), currency: z.string().length(3), timezone: z.string().min(3).max(80), taxRate: z.number().min(0).max(100), expiryAlertDays: z.number().int().min(1).max(365) }).superRefine((value, ctx) => {
  try { new Intl.NumberFormat('en', { style: 'currency', currency: value.currency }); } catch { ctx.addIssue({ code: 'custom', path: ['currency'], message: 'Enter a supported ISO 4217 currency code' }); }
  try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }); } catch { ctx.addIssue({ code: 'custom', path: ['timezone'], message: 'Enter a valid IANA timezone' }); }
});
export async function PUT(request: Request) {
  const { user, response } = await requirePermission('settings', 'update'); if (response) return response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' }, { status: 400 });
  const settings = await db.$transaction(async tx => {
    const updated = await tx.pharmacySettings.upsert({ where: { id: 'default' }, update: parsed.data, create: { id: 'default', ...parsed.data } });
    await tx.auditLog.create({ data: { actorId: user!.id, action: 'UPDATE', entity: 'PharmacySettings', entityId: 'default', changes: parsed.data } });
    return updated;
  });
  return Response.json({ settings });
}
