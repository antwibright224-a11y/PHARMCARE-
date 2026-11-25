'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, KeyRound, LockKeyhole, Mail, Plus, ShieldCheck, UserRound } from 'lucide-react';

const requestedRoles = [
  ['CASHIER', 'Sales Person'],
  ['PHARMACIST', 'Pharmacist'],
  ['INVENTORY_MANAGER', 'Inventory Manager'],
  ['PHARMACY_MANAGER', 'Pharmacy Manager'],
] as const;

export default function SignupForm() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');

    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setPending(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          password,
          requestedRole: form.get('requestedRole'),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? 'Could not create your account.');
      setCreated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
    } finally {
      setPending(false);
    }
  }

  return <main className="login-shell">
    <section className="login-brand-side">
      <div className="medical-atmosphere" aria-hidden="true">
        <span className="atmosphere-glow atmosphere-glow-one"/>
        <span className="atmosphere-glow atmosphere-glow-two"/>
        <span className="floating-capsule floating-capsule-one"/>
        <span className="floating-capsule floating-capsule-two"/>
        <svg className="molecule molecule-one" viewBox="0 0 120 120" fill="none">
          <path d="m27 36 31 16 31-20M58 52l-4 35m4-35 33 23" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="27" cy="36" r="7" fill="currentColor"/><circle cx="58" cy="52" r="9" fill="currentColor"/><circle cx="89" cy="32" r="6" fill="currentColor"/><circle cx="54" cy="87" r="6" fill="currentColor"/><circle cx="91" cy="75" r="7" fill="currentColor"/>
        </svg>
        <svg className="medical-ecg" viewBox="0 0 640 100" fill="none">
          <path d="M0 54h175l26-1 18-22 26 48 35-71 30 88 27-43h39l20 1h244" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="atmosphere-particle particle-one"/><span className="atmosphere-particle particle-two"/><span className="atmosphere-particle particle-three"/>
      </div>
      <div className="login-brand"><span className="brand-mark"><Plus size={23}/></span><span><b>pharma<span>care</span></b><small>PHARMACY MANAGEMENT</small></span></div>
      <div className="login-hero"><span className="eyebrow">YOUR PHARMACY, IN GOOD HANDS</span><h1>Care runs better<br/>when everything<br/><em>works together.</em></h1><p>One thoughtful workspace for the medicines, people and moments that matter.</p><div className="login-assurance"><ShieldCheck size={17}/><span>Private, secure access for your pharmacy team</span></div></div>
      <div className="login-copyright">© 2026 PharmaCare · Made for better health</div>
    </section>
    <section className="login-form-side">
      <div className="login-form-wrap">
        <div className="login-mobile-brand"><span className="brand-mark"><Plus size={20}/></span><b>pharma<span>care</span></b></div>
        <span className="eyebrow">{created ? 'ACCOUNT CREATED' : 'GET STARTED'}</span>
        <h2>{created ? 'You’re all set' : 'Create your account'}</h2>
        <p className="login-intro">{created ? 'Your account is ready with sales access. Your requested role will take effect only after a Super Admin approves it.' : 'Choose the role you are requesting. Your account will start with sales access until a Super Admin approves a different role.'}</p>
        {created ? <Link className="button button-primary login-submit signup-link-button" href="/login">Continue to sign in <ArrowRight size={17}/></Link> : <>
          <form onSubmit={submit} className="login-form">
            <label className="login-label">Full name<div className="login-input-wrap"><UserRound size={17}/><input name="name" type="text" autoComplete="name" minLength={2} maxLength={120} placeholder="Your name" required/></div></label>
            <label className="login-label">Work email<div className="login-input-wrap"><Mail size={17}/><input name="email" type="email" autoComplete="email" placeholder="you@pharmacy.com" required/></div></label>
            <label className="login-label">Role requested<select className="signup-role-select" name="requestedRole" defaultValue="CASHIER" required>{requestedRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="login-label">Password<div className="login-input-wrap"><LockKeyhole size={17}/><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={100} placeholder="At least 12 characters" required/></div></label>
            <label className="login-label">Confirm password<div className="login-input-wrap"><KeyRound size={17}/><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={100} placeholder="Re-enter your password" required/></div></label>
            {error && <div className="login-error" role="alert">{error}</div>}
            <button className="button button-primary login-submit" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}{!pending && <ArrowRight size={17}/>}</button>
          </form>
          <p className="login-security"><LockKeyhole size={13}/> A Super Admin must approve elevated role requests.</p>
          <p className="signup-alternate">Already have an account? <Link href="/login">Sign in</Link></p>
        </>}
      </div>
    </section>
  </main>;
}
