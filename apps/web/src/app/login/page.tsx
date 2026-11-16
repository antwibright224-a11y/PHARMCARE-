import type { Metadata } from 'next';
import Login from './login-form';
export const metadata: Metadata = { title: 'Sign in · PharmaCare' };
export default function LoginPage() { return <Login />; }
