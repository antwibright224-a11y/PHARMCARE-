import { z } from 'zod';
import { can, currentUser, requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const user = await currentUser();
  if (!user || !(await can(user, 'suppliers', 'read'))) return Response.json({ error: 'Permission denied' }, { status: user ? 403 : 401 });
  const suppliers = await db.supplier.findMany({ include: { purchases: { select: { id: true, orderNumber: true, status: true, total: true, payments: { select: { amount: true } } } } }, orderBy: { name: 'asc' } });
  return Response.json({ suppliers });
}
const schema = z.object({ name: z.string().min(2).max(150), contactName: z.string().max(120).optional(), email: z.union([z.email(), z.literal('')]).optional(), phone: z.string().max(50).optional(), address: z.string().max(250).optional() });
export async function POST(request: Request) {
  const { user, response } = await requirePermission('suppliers', 'create'); if (response) return response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid supplier details' }, { status: 400 });
  const supplier = await db.supplier.create({ data: parsed.data });
  await db.auditLog.create({ data: { actorId: user!.id, action: 'CREATE', entity: 'Supplier', entityId: supplier.id, changes: parsed.data } });
  return Response.json({ supplier }, { status: 201 });
}
