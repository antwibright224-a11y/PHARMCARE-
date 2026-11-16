import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
const schema = z.object({ name: z.string().min(2).max(150).optional(), genericName: z.string().max(150).optional(), barcode: z.string().max(100).nullable().optional(), category: z.string().min(2).max(80).optional(), dosageForm: z.string().min(2).max(80).optional(), strength: z.string().min(1).max(80).optional(), manufacturer: z.string().max(120).optional(), prescriptionRequired: z.boolean().optional(), sellingPrice: z.number().nonnegative().optional(), reorderLevel: z.number().int().nonnegative().optional(), archived: z.boolean().optional() }).refine(value => Object.keys(value).length > 0);
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission('medicines', 'update'); if (response) return response;
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: 'Invalid medicine update' }, { status: 400 });
  const { id } = await context.params;
  try {
    const result = await db.$transaction(async tx => {
      const previous = await tx.medicine.findUniqueOrThrow({ where: { id } });
      const medicine = await tx.medicine.update({ where: { id }, data: parsed.data });
      await tx.auditLog.create({ data: { actorId: user!.id, action: parsed.data.archived === true ? 'ARCHIVE' : 'UPDATE', entity: 'Medicine', entityId: id, changes: { before: { name: previous.name, sellingPrice: previous.sellingPrice.toString(), archived: previous.archived }, after: parsed.data } } });
      return medicine;
    });
    return Response.json({ medicine: result });
  } catch { return Response.json({ error: 'Could not update medicine; verify its record and barcode' }, { status: 400 }); }
}
