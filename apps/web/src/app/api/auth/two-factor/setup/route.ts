import { pendingMfaChallenge } from '@/lib/auth';
import { db } from '@/lib/db';
import { decryptTotpSecret, encryptTotpSecret, newTotpSecret, totpUri } from '@/lib/two-factor-crypto';

export async function GET() {
  try {
    const challenge = await pendingMfaChallenge();
    if (!challenge) return Response.json({ error: 'Sign-in challenge expired. Sign in again.' }, { status: 401 });
    if (challenge.user.twoFactorEnabled) return Response.json({ error: 'This account already has two-factor authentication enabled.' }, { status: 400 });

    let stored = challenge.setupSecret;
    if (!stored) {
      const created = encryptTotpSecret(newTotpSecret());
      await db.twoFactorChallenge.updateMany({ where: { id: challenge.id, setupSecret: null }, data: { setupSecret: created } });
      stored = (await db.twoFactorChallenge.findUnique({ where: { id: challenge.id }, select: { setupSecret: true } }))?.setupSecret ?? null;
    }
    if (!stored) return Response.json({ error: 'Could not start authenticator setup. Sign in again.' }, { status: 503 });
    const secret = decryptTotpSecret(stored);
    return Response.json({ secret, otpauthUri: totpUri(secret, challenge.user.email) });
  } catch (error) {
    console.error('Two-factor setup failed:', error);
    return Response.json({ error: 'Could not start authenticator setup.' }, { status: 503 });
  }
}
