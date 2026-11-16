import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password-crypto';
const roles = ['SUPER_ADMIN', 'PHARMACY_MANAGER', 'PHARMACIST', 'CASHIER', 'INVENTORY_MANAGER'] as const;
export async function GET() {
  const { response } = await requirePermission('users', 'read'); if (response) return response;
  return Response.json({ users: await db.user.findMany({ select: { id: true, name: true, email: true, role: true, requestedRole: true, disabled: true, createdAt: true }, orderBy: { name: 'asc' } }) });
}
const schema = z.object({ name: z.string().min(2).max(120), email: z.email(), password: z.string().min(12).max(100), role: z.enum(roles) });
export async function POST(request: Request) {
  const { user, response } = await requirePermission('users', 'create'); if (response) return response;
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid user details' }, { status: 400 });
  if (parsed.data.role === 'SUPER_ADMIN' && user!.role !== 'SUPER_ADMIN') return Response.json({ error: 'Only a super admin can create another super admin' }, { status: 403 });
  try {
    const saved = await db.user.create({ data: { ...parsed.data, email: parsed.data.email.toLowerCase(), passwordHash: await hashPassword(parsed.data.password) }, select: { id: true, name: true, email: true, role: true, disabled: true } });
    await db.auditLog.create({ data: { actorId: user!.id, action: 'CREATE', entity: 'User', entityId: saved.id, changes: { email: saved.email, role: saved.role } } });
    return Response.json({ user: saved }, { status: 201 });
  } catch { return Response.json({ error: 'Email is already registered' }, { status: 409 }); }
}
