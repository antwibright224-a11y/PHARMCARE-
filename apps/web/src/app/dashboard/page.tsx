import { redirect } from 'next/navigation';
import { can, currentUser } from '@/lib/auth';
import Dashboard from '@/components/dashboard';

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  const [overview, pointOfSale, medicines, addMedicine, editMedicine, inventory, purchases, suppliers, sales, returns, expenses, reports, users, addUsers, updateUsers, settings, audit] = await Promise.all([
    can(user, 'dashboard', 'read'),
    can(user, 'sales', 'create'),
    can(user, 'medicines', 'read'),
    can(user, 'medicines', 'create'),
    can(user, 'medicines', 'update'),
    can(user, 'inventory', 'read'),
    can(user, 'purchases', 'read'),
    can(user, 'suppliers', 'read'),
    can(user, 'sales', 'read'),
    can(user, 'returns', 'read'),
    can(user, 'expenses', 'read'),
    can(user, 'reports', 'read'),
    can(user, 'users', 'read'),
    can(user, 'users', 'create'),
    can(user, 'users', 'update'),
    can(user, 'settings', 'read'),
    can(user, 'audit', 'read'),
  ]);
  if (!overview) redirect('/login');

  const access = {
    overview, pointOfSale, medicines, addMedicine, editMedicine, inventory, purchases, suppliers,
    sales, returns, expenses, reports, users, addUsers, updateUsers, settings, audit,
  };
  return <Dashboard user={{ name: user.name, role: user.role }} access={access} />;
}
