import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password-crypto';
const roles = ['SUPER_ADMIN', 'PHARMACY_MANAGER', 'PHARMACIST', 'CASHIER', 'INVENTORY_MANAGER'] as const;
const schema = z.object({ disabled: z.boolean().optional(), role: z.enum(roles).optional(), password: z.string().min(12).max(100).optional(), resetTwoFactor: z.boolean().optional() }).refine(x => Object.keys(x).length > 0);
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission('users', 'update'); if (response) return response;
  const { id } = await context.params; const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: 'Invalid user update' }, { status: 400 });
  const target = await db.user.findUnique({ where: { id } }); if (!target) return Response.json({ error: 'User not found' }, { status: 404 });
  if (parsed.data.resetTwoFactor && user!.role !== 'SUPER_ADMIN') return Response.json({ error: 'Only a super admin can reset two-factor authentication' }, { status: 403 });
  if (parsed.data.resetTwoFactor && target.id === user!.id) return Response.json({ error: 'Another super admin must reset your authenticator' }, { status: 400 });
  if (parsed.data.role && user!.role !== 'SUPER_ADMIN') return Response.json({ error: 'Only a super admin can approve or change user roles' }, { status: 403 });
  if (target.role === 'SUPER_ADMIN' && user!.role !== 'SUPER_ADMIN') return Response.json({ error: 'Only a super admin can change super admin accounts' }, { status: 403 });
  if (target.id === user!.id && parsed.data.disabled) return Response.json({ error: 'You cannot disable your own account' }, { status: 400 });
  const data: { disabled?: boolean; role?: typeof roles[number]; requestedRole?: null; passwordHash?: string; twoFactorEnabled?: boolean; twoFactorSecret?: null } = { disabled: parsed.data.disabled, role: parsed.data.role };
  if (parsed.data.role) data.requestedRole = null;
  if (parsed.data.password) data.passwordHash = await hashPassword(parsed.data.password);
  if (parsed.data.resetTwoFactor) { data.twoFactorEnabled = false; data.twoFactorSecret = null; }
  const saved = await db.user.update({ where: { id }, data, select: { id: true, name: true, email: true, role: true, disabled: true } });
  await db.auditLog.create({ data: { actorId: user!.id, action: parsed.data.resetTwoFactor ? 'RESET_TWO_FACTOR' : 'UPDATE', entity: 'User', entityId: id, changes: { role: parsed.data.role, disabled: parsed.data.disabled, passwordChanged: Boolean(parsed.data.password), twoFactorReset: Boolean(parsed.data.resetTwoFactor) } } });
  if (parsed.data.password || parsed.data.disabled || parsed.data.resetTwoFactor) await db.session.deleteMany({ where: { userId: id } });
  if (parsed.data.resetTwoFactor || parsed.data.disabled) await db.twoFactorChallenge.deleteMany({ where: { userId: id } });
  return Response.json({ user: saved });
}
