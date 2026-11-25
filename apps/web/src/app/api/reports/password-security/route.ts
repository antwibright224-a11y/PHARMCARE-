import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildPasswordSecurityReport } from '@/lib/password-security-report';

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
  if (user.role !== 'SUPER_ADMIN') return Response.json({ error: 'Only a super admin can view the password security report' }, { status: 403 });

  const users = await db.user.findMany({ select: { name: true, email: true, passwordHash: true }, orderBy: { name: 'asc' } });
  return Response.json({ report: buildPasswordSecurityReport(users) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
