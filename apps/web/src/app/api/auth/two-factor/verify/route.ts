import { z } from 'zod';
import { completeMfaChallenge, pendingMfaChallenge, verifyEmailCode } from '@/lib/auth';
import { db } from '@/lib/db';
import { decryptTotpSecret, verifyTotp } from '@/lib/two-factor-crypto';

const schema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  const challenge = await pendingMfaChallenge();
  if (!challenge) return Response.json({ error: 'Sign-in challenge expired. Sign in again.' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter the 6-digit code from your authenticator app.' }, { status: 400 });

  let valid = false;
  let setupSecret: string | undefined;
  if (challenge.emailCodeHash) {
    valid = verifyEmailCode(parsed.data.code, challenge.emailCodeHash);
  } else {
    const encryptedSecret = challenge.user.twoFactorEnabled ? challenge.user.twoFactorSecret : challenge.setupSecret;
    if (!encryptedSecret) return Response.json({ error: 'Authenticator setup is required before signing in.' }, { status: 400 });
    try {
      setupSecret = challenge.user.twoFactorEnabled ? undefined : encryptedSecret;
      valid = verifyTotp(decryptTotpSecret(encryptedSecret), parsed.data.code);
    } catch (error) {
      console.error('Two-factor secret could not be verified:', error);
      return Response.json({ error: 'Authenticator configuration is unavailable.' }, { status: 503 });
    }
  }
  if (!valid) {
    await db.twoFactorChallenge.updateMany({ where: { id: challenge.id, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    return Response.json({ error: 'That code is not valid. Check your authenticator and try again.' }, { status: challenge.attempts >= 4 ? 429 : 401 });
  }

  try {
    await completeMfaChallenge(challenge.id, setupSecret);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not complete sign-in.' }, { status: 409 });
  }
}
