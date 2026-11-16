import { createHmac, hkdfSync } from 'node:crypto';
import { compare, hash } from 'bcryptjs';

const VERSION = 'pcv1:';

function pepperKey() {
  const master = process.env.PASSWORD_PEPPER ?? process.env.SESSION_SECRET;
  if (!master || Buffer.byteLength(master) < 32) throw new Error('PASSWORD_PEPPER or SESSION_SECRET must contain at least 32 bytes');
  return Buffer.from(hkdfSync('sha256', Buffer.from(master), Buffer.from('pharmacare-password'), Buffer.from('bcrypt-pepper-v1'), 32));
}

function prehash(password: string) {
  return createHmac('sha256', pepperKey()).update(password, 'utf8').digest('base64url');
}

export async function hashPassword(password: string) {
  return `${VERSION}${await hash(prehash(password), 12)}`;
}

export async function verifyPassword(password: string, encoded: string) {
  if (encoded.startsWith(VERSION)) return { valid: await compare(prehash(password), encoded.slice(VERSION.length)), needsUpgrade: false };
  return { valid: await compare(password, encoded), needsUpgrade: true };
}
