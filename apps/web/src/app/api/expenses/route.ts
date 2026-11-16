import { expenseSchema } from '@pharmacare/shared';
import { can, currentUser, requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !(await can(user, 'expenses', 'read'))) return Response.json({ error: 'Permission denied' }, { status: user ? 403 : 401 });
  const params = new URL(request.url).searchParams; const from = params.get('from'); const to = params.get('to');
  const expenses = await db.expense.findMany({ where: { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }, orderBy: { date: 'desc' } });
  return Response.json({ expenses });
}
export async function POST(request: Request) {
  const { user, response } = await requirePermission('expenses', 'create'); if (response) return response;
  const key = request.headers.get('Idempotency-Key'); if (!key) return Response.json({ error: 'Idempotency-Key header is required' }, { status: 400 });
  const parsed = expenseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid expense' }, { status: 400 });
  const existing = await db.expense.findUnique({ where: { idempotencyKey: key } }); if (existing) return Response.json({ expense: existing, replayed: true });
  try {
  const expense = await db.$transaction(async tx => {
    const saved = await tx.expense.create({ data: { ...parsed.data, idempotencyKey: key } });
    await tx.auditLog.create({ data: { actorId: user!.id, action: 'CREATE', entity: 'Expense', entityId: saved.id, changes: { category: saved.category, amount: saved.amount.toString() } } });
    return saved;
  });
  return Response.json({ expense }, { status: 201 });
  } catch { const replay = await db.expense.findUnique({ where: { idempotencyKey: key } }); if (replay) return Response.json({ expense: replay, replayed: true }); return Response.json({ error: 'Could not record expense' }, { status: 409 }); }
}
