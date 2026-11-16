export const rolePermissions: Record<string, Record<string, readonly string[]>> = {
  SUPER_ADMIN: { '*': ['*'] },
  PHARMACY_MANAGER: { '*': ['read', 'create', 'update'], users: ['read', 'create', 'update'], audit: ['read'] },
  PHARMACIST: { dashboard: ['read'], settings: ['read'], medicines: ['read'], inventory: ['read'], sales: ['read', 'create'], returns: ['read', 'create'], reports: ['read'] },
  CASHIER: { dashboard: ['read'], settings: ['read'], medicines: ['read'], inventory: ['read'], sales: ['read', 'create'], returns: ['read', 'create'] },
  INVENTORY_MANAGER: { dashboard: ['read'], settings: ['read'], medicines: ['read', 'create', 'update'], inventory: ['read', 'create', 'update'], suppliers: ['read', 'create', 'update'], purchases: ['read', 'create', 'update'] },
};

export function hasRolePermission(role: string, resource: string, action: string) {
  const permissions = rolePermissions[role] ?? {};
  const globalPermissions = permissions['*'] ?? [];
  const resourcePermissions = permissions[resource] ?? [];

  return Boolean(
    globalPermissions.includes('*') ||
    globalPermissions.includes(action) ||
    resourcePermissions.includes('*') ||
    resourcePermissions.includes(action)
  );
}
