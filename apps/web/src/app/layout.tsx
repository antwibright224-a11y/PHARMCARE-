import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PharmaCare — Pharmacy Management',
  description: 'A clear, connected workspace for pharmacy operations, inventory and sales.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
