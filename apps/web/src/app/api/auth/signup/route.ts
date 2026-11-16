import { Prisma } from '@prisma/client';
import { signupSchema } from '@pharmacare/shared';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password-crypto';

export async function POST(request: Request) {
  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid account details' }, { status: 400 });

  const { password, ...profile } = parsed.data;
  const passwordHash = await hashPassword(password);
  try {
    const user = await db.$transaction(async tx => {
      const created = await tx.user.create({
        data: {
          ...profile,
          passwordHash,
          role: 'CASHIER',
          requestedRole: profile.requestedRole,
        },
        select: { id: true, name: true, email: true, role: true, requestedRole: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: created.id,
          action: 'SIGN_UP',
          entity: 'User',
          entityId: created.id,
          changes: { email: created.email, role: created.role, requestedRole: created.requestedRole },
        },
      });
      return created;
    });

    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return Response.json({ error: 'An account with this email already exists' }, { status: 409 });
    }
    throw error;
  }
}
