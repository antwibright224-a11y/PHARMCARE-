import 'server-only';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { hasRolePermission } from '@pharmacare/shared';
import { db } from './db';
import { sendSignInCode } from './email';

const COOKIE = 'pharmacare_session';
const MFA_COOKIE = 'pharmacare_mfa_challenge';
const hash = (token: string) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('SESSION_SECRET must contain at least 32 bytes');
  return createHmac('sha256', secret).update(token).digest('hex');
};

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
  await db.session.create({ data: { tokenHash: hash(token), userId, expiresAt, mfaVerified: true } });
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
}

export async function createMfaChallenge(userId: string, email: string, useEmailCode: boolean) {
  const token = randomBytes(32).toString('base64url');
  const emailCode = useEmailCode ? randomInt(0, 1_000_000).toString().padStart(6, '0') : null;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  if (useEmailCode) {
    const recent = await db.twoFactorChallenge.findFirst({
      where: { userId, emailCodeHash: { not: null }, createdAt: { gt: new Date(Date.now() - 60_000) } },
      select: { id: true },
    });
    if (recent) throw new Error('A verification code was sent recently. Wait a minute before requesting another.');
  }
  await db.twoFactorChallenge.deleteMany({ where: { userId } });
  await db.twoFactorChallenge.create({
    data: {
      tokenHash: hash(token),
      userId,
      expiresAt,
      emailCodeHash: emailCode ? hash(`pharmacare-email-otp:${emailCode}`) : null,
    },
  });
  if (emailCode) {
    try {
      await sendSignInCode(email, emailCode);
    } catch (error) {
      await db.twoFactorChallenge.deleteMany({ where: { tokenHash: hash(token) } });
      throw error;
    }
  }
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.set(MFA_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', expires: expiresAt });
}

export async function sendPendingMfaEmailCode() {
  const challenge = await pendingMfaChallenge();
  if (!challenge) throw new Error('MFA_CHALLENGE_EXPIRED');
  if (challenge.emailCodeHash) throw new Error('MFA_EMAIL_ALREADY_SENT');

  const emailCode = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const emailCodeHash = hash(`pharmacare-email-otp:${emailCode}`);
  const reserved = await db.twoFactorChallenge.updateMany({
    where: { id: challenge.id, emailCodeHash: null, attempts: { lt: 5 }, expiresAt: { gt: new Date() } },
    data: { emailCodeHash },
  });
  if (reserved.count !== 1) throw new Error('MFA_EMAIL_ALREADY_SENT');

  try {
    await sendSignInCode(challenge.user.email, emailCode);
  } catch (error) {
    await db.twoFactorChallenge.updateMany({ where: { id: challenge.id, emailCodeHash }, data: { emailCodeHash: null } });
    throw error;
  }
}

export function verifyEmailCode(supplied: string, storedHash: string) {
  const actual = Buffer.from(hash(`pharmacare-email-otp:${supplied}`), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function pendingMfaChallenge() {
  const token = (await cookies()).get(MFA_COOKIE)?.value;
  if (!token) return null;
  const challenge = await db.twoFactorChallenge.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  if (!challenge || challenge.expiresAt < new Date() || challenge.attempts >= 5 || challenge.user.disabled) return null;
  return challenge;
}

export async function completeMfaChallenge(challengeId: string, setupSecret?: string) {
  const sessionToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
  await db.$transaction(async tx => {
    const challenge = await tx.twoFactorChallenge.findUnique({ where: { id: challengeId }, include: { user: true } });
    if (!challenge || challenge.expiresAt < new Date() || challenge.attempts >= 5 || challenge.user.disabled) throw new Error('Sign-in challenge expired; sign in again.');
    const consumed = await tx.twoFactorChallenge.deleteMany({ where: { id: challengeId } });
    if (consumed.count !== 1) throw new Error('Sign-in challenge was already used. Sign in again.');
    if (setupSecret) {
      await tx.user.update({ where: { id: challenge.userId }, data: { twoFactorEnabled: true, twoFactorSecret: setupSecret } });
      await tx.auditLog.create({ data: { actorId: challenge.userId, action: 'TWO_FACTOR_ENABLED', entity: 'User', entityId: challenge.userId, changes: { method: 'TOTP' } } });
    }
    await tx.session.create({ data: { tokenHash: hash(sessionToken), userId: challenge.userId, expiresAt, mfaVerified: true } });
  });
  const jar = await cookies();
  jar.delete(MFA_COOKIE);
  jar.set(COOKIE, sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const mfaToken = jar.get(MFA_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
  if (mfaToken) await db.twoFactorChallenge.deleteMany({ where: { tokenHash: hash(mfaToken) } });
  jar.delete(COOKIE);
  jar.delete(MFA_COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
  if (!session || !session.mfaVerified || session.expiresAt < new Date() || session.user.disabled) return null;
  return session.user;
}

export async function can(user: { id: string; role: string }, resource: string, action: string) {
  const override = await db.permission.findUnique({ where: { role_resource_action: { role: user.role as never, resource, action } } });
  if (override) return override.allowed;
  return hasRolePermission(user.role, resource, action);
}

export async function requirePermission(resource: string, action: string) {
  const user = await currentUser();
  if (!user) return { user: null, response: Response.json({ error: 'Authentication required' }, { status: 401 }) };
  if (!(await can(user, resource, action))) return { user: null, response: Response.json({ error: 'Permission denied' }, { status: 403 }) };
  return { user, response: null };
}
