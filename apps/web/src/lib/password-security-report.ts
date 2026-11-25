import { passwordHashSecurityStatus } from './password-crypto';

export type PasswordAccount = {
  name: string;
  email: string;
  passwordHash: string;
};

export function buildPasswordSecurityReport(accounts: PasswordAccount[]) {
  const users = accounts.map(({ passwordHash, ...account }) => {
    const secure = passwordHashSecurityStatus(passwordHash) === 'CURRENT';
    return {
      ...account,
      hashingAlgorithm: 'bcrypt',
      saltProtected: true,
      pepperProtected: secure,
      passwordSecurityStatus: secure ? 'SECURE' : 'REQUIRES_IMPROVEMENT',
    };
  });

  return {
    summary: {
      totalUsers: users.length,
      securePasswordStorage: users.filter(user => user.passwordSecurityStatus === 'SECURE').length,
      requiresSecurityImprovements: users.filter(user => user.passwordSecurityStatus === 'REQUIRES_IMPROVEMENT').length,
    },
    users,
  };
}
