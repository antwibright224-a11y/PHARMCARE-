import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
const roles = ['SUPER_ADMIN', 'PHARMACY_MANAGER', 'PHARMACIST', 'CASHIER', 'INVENTORY_MANAGER'] as const;
const schema = z.object({ role: z.enum(roles), resource: z.string().min(2).max(80), action: z.string().min(2).max(30), allowed: z.boolean() });
export async function GET() {
  const { response } = await requirePermission('users', 'read'); if (response) return response;
  return Response.json({ permissions: await db.permission.findMany({ orderBy: [{ role: 'asc' }, { resource: 'asc' }, { action: 'asc' }] }) });
}
export async function PUT(request: Request) {
  const { user, response } = await requirePermission('users', 'update'); if (response) return response;
  if (user!.role !== 'SUPER_ADMIN') return Response.json({ error: 'Only a super admin can edit the permission matrix' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: 'Invalid permission rule' }, { status: 400 });
  if (parsed.data.role === 'SUPER_ADMIN' && !parsed.data.allowed) return Response.json({ error: 'Super admin permissions cannot be disabled' }, { status: 400 });
  const permission = await db.permission.upsert({ where: { role_resource_action: parsed.data }, update: { allowed: parsed.data.allowed }, create: parsed.data });
  await db.auditLog.create({ data: { actorId: user!.id, action: 'UPDATE_PERMISSION', entity: 'Permission', entityId: permission.id, changes: parsed.data } });
  return Response.json({ permission });
}
