import { medicineSchema } from '@pharmacare/shared';
import { can, currentUser, requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !(await can(user, 'medicines', 'read'))) return Response.json({ error: 'Authentication required' }, { status: user ? 403 : 401 });
  const search = new URL(request.url).searchParams.get('q') ?? '';
  const medicines = await db.medicine.findMany({ where: { archived: false, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { genericName: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] } : {}) }, include: { batches: { where: { expiryDate: { gt: new Date() } }, select: { quantity: true } } }, orderBy: { name: 'asc' } });
  const data = medicines.map(({ batches, ...medicine }) => ({ ...medicine, stock: batches.reduce((n, b) => n + b.quantity, 0) }));
  if (new URL(request.url).searchParams.get('format') === 'csv') {
    const fields = ['name', 'genericName', 'sku', 'barcode', 'category', 'dosageForm', 'strength', 'manufacturer', 'sellingPrice', 'stock', 'reorderLevel'];
    const rows = [fields, ...data.map(m => fields.map(field => field === 'sellingPrice' ? String(m.sellingPrice) : String(m[field as keyof typeof m] ?? '')))];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="pharmacare-medicines.csv"' } });
  }
  return Response.json({ medicines: data });
}

export async function POST(request: Request) {
  const { user, response } = await requirePermission('medicines', 'create'); if (response) return response;
  const parsed = medicineSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid medicine details' }, { status: 400 });
  try {
    const medicine = await db.$transaction(async tx => {
      const saved = await tx.medicine.create({ data: { ...parsed.data, sellingPrice: parsed.data.sellingPrice } });
      await tx.auditLog.create({ data: { actorId: user!.id, action: 'CREATE', entity: 'Medicine', entityId: saved.id, changes: parsed.data } });
      return saved;
    });
    return Response.json({ medicine: { ...medicine, stock: 0 } }, { status: 201 });
  } catch { return Response.json({ error: 'SKU or barcode is already in use' }, { status: 409 }); }
}
