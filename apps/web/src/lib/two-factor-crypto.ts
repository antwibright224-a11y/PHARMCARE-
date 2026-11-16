import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encryptionKey() {
  const master = process.env.MFA_ENCRYPTION_KEY ?? process.env.SESSION_SECRET;
  if (!master || Buffer.byteLength(master) < 32) throw new Error('MFA_ENCRYPTION_KEY or SESSION_SECRET must contain at least 32 bytes');
  return Buffer.from(hkdfSync('sha256', Buffer.from(master), Buffer.from('pharmacare-mfa'), Buffer.from('totp-secret-aes-256-gcm-v1'), 32));
}

function encodeBase32(bytes: Buffer) {
  let bits = 0; let value = 0; let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string) {
  let bits = 0; let buffer = 0; const bytes: number[] = [];
  for (const character of value.toUpperCase().replace(/=+$/g, '').replace(/\s/g, '')) {
    const digit = BASE32.indexOf(character);
    if (digit < 0) throw new Error('Invalid authenticator secret');
    buffer = (buffer << 5) | digit; bits += 5;
    if (bits >= 8) { bytes.push((buffer >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export function newTotpSecret() { return encodeBase32(randomBytes(20)); }

export function encryptTotpSecret(secret: string) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from('pharmacare-totp-v1'));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptTotpSecret(value: string) {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Unsupported encrypted authenticator secret');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from('pharmacare-totp-v1'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export function totpAt(secret: string, timeMs = Date.now()) {
  const counter = BigInt(Math.floor(timeMs / 30000)); const message = Buffer.alloc(8); message.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest(); const offset = digest[digest.length - 1] & 0x0f;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return number.toString().padStart(6, '0');
}

export function verifyTotp(secret: string, supplied: string, timeMs = Date.now()) {
  if (!/^\d{6}$/.test(supplied)) return false;
  const provided = Buffer.from(supplied);
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(totpAt(secret, timeMs + drift * 30000));
    if (timingSafeEqual(provided, expected)) return true;
  }
  return false;
}

export function totpUri(secret: string, email: string) {
  const label = encodeURIComponent(`PharmaCare:${email}`);
  const params = new URLSearchParams({ secret, issuer: 'PharmaCare', algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}
