import { can, currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
export async function GET() {
  const user = await currentUser();
  if (!user || !(await can(user, 'audit', 'read'))) return Response.json({ error: 'Permission denied' }, { status: user ? 403 : 401 });
  const entries = await db.auditLog.findMany({ take: 200, include: { actor: { select: { name: true, email: true, role: true } } }, orderBy: { createdAt: 'desc' } });
  return Response.json({ entries });
}
