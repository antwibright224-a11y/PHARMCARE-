import { loginSchema } from '@pharmacare/shared';
import { db } from '@/lib/db';
import { createMfaChallenge } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password-crypto';

export async function POST(request: Request) {
  try {
    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: 'Enter a valid email and password' }, { status: 400 });
    const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (!user || user.disabled) return Response.json({ error: 'Email or password is incorrect' }, { status: 401 });
    const password = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!password.valid) return Response.json({ error: 'Email or password is incorrect' }, { status: 401 });
    if (password.needsUpgrade) await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } });
    const verificationMethod = parsed.data.verificationMethod;
    await createMfaChallenge(user.id, user.email, verificationMethod === 'email');
    return Response.json({
      requiresTwoFactor: true,
      setupRequired: verificationMethod === 'authenticator' && !user.twoFactorEnabled,
      verificationMethod,
    });
  } catch (error) {
    console.error('Login request failed:', error);
    if (error instanceof Error && error.message === 'EMAIL_DELIVERY_FAILED') {
      return Response.json({ error: 'Could not send a verification code. Check the SMTP settings and try again.' }, { status: 503 });
    }
    if (error instanceof Error && error.message.startsWith('A verification code was sent recently')) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    return Response.json({ error: 'Sign-in service is unavailable. Check the database connection and SESSION_SECRET, then restart the app.' }, { status: 503 });
  }
}
