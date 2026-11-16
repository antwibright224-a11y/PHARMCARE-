import test from 'node:test';
import assert from 'node:assert/strict';
import { hash } from 'bcryptjs';
import { hashPassword, verifyPassword } from '../src/lib/password-crypto';
import { decryptTotpSecret, encryptTotpSecret, totpAt, verifyTotp } from '../src/lib/two-factor-crypto';

process.env.PASSWORD_PEPPER = 'test-password-pepper-value-that-is-long-enough';
process.env.MFA_ENCRYPTION_KEY = 'test-mfa-encryption-key-value-that-is-long-enough';

test('TOTP matches the RFC 6238 SHA-1 test vector and accepts a small clock drift', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpAt(secret, 59_000), '287082');
  assert.equal(verifyTotp(secret, '287082', 59_000), true);
  assert.equal(verifyTotp(secret, '287082', 89_000), true);
  assert.equal(verifyTotp(secret, '000000', 59_000), false);
});

test('TOTP secrets are encrypted with authenticated encryption at rest', () => {
  const encrypted = encryptTotpSecret('JBSWY3DPEHPK3PXP');
  assert.notEqual(encrypted, 'JBSWY3DPEHPK3PXP');
  assert.equal(decryptTotpSecret(encrypted), 'JBSWY3DPEHPK3PXP');
  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(() => decryptTotpSecret(tampered));
});

test('passwords use bcrypt salt plus a separately derived pepper and upgrade legacy hashes', async () => {
  const encoded = await hashPassword('Correct horse battery staple');
  assert.equal((await verifyPassword('Correct horse battery staple', encoded)).valid, true);
  assert.equal((await verifyPassword('incorrect', encoded)).valid, false);
  const oldHash = await hash('Correct horse battery staple', 4);
  const legacy = await verifyPassword('Correct horse battery staple', oldHash);
  assert.deepEqual(legacy, { valid: true, needsUpgrade: true });
});
