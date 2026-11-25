import test from 'node:test';
import assert from 'node:assert/strict';
import { hash } from 'bcryptjs';
import { hashPassword } from '../src/lib/password-crypto';
import { buildPasswordSecurityReport } from '../src/lib/password-security-report';

process.env.PASSWORD_PEPPER = 'test-password-pepper-value-that-is-long-enough';

test('password security report returns storage status without exposing password hashes or salts', async () => {
  const currentHash = await hashPassword('Correct horse battery staple');
  const legacyHash = await hash('Correct horse battery staple', 4);
  const report = buildPasswordSecurityReport([
    { name: 'Current User', email: 'current@example.test', passwordHash: currentHash },
    { name: 'Legacy User', email: 'legacy@example.test', passwordHash: legacyHash },
  ]);

  assert.deepEqual(report.summary, { totalUsers: 2, securePasswordStorage: 1, requiresSecurityImprovements: 1 });
  assert.equal(report.users[0].name, 'Current User');
  assert.equal(report.users[0].passwordSecurityStatus, 'SECURE');
  assert.equal('salt' in report.users[0], false);
  assert.equal('hashedPassword' in report.users[0], false);
  assert.equal('passwordHash' in report.users[0], false);

  assert.equal(report.users[1].name, 'Legacy User');
  assert.equal(report.users[1].passwordSecurityStatus, 'REQUIRES_IMPROVEMENT');
  assert.equal(JSON.stringify(report).includes(currentHash), false);
  assert.equal(JSON.stringify(report).includes(legacyHash), false);

  // Verify that the server pepper secret itself is still never leaked into the report payload
  assert.equal(JSON.stringify(report).includes('test-password-pepper-value-that-is-long-enough'), false);
});
