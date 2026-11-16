'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, KeyRound, LockKeyhole, Mail, Plus, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function Login() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [factorRequired, setFactorRequired] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState<'authenticator' | 'email'>('authenticator');
  const [setupSecret, setSetupSecret] = useState('');
  const [setupUri, setSetupUri] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const router = useRouter();

  async function sendEmailCode() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/two-factor/email', { method: 'POST' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? 'Could not send an email verification code.');
      setVerificationMethod('email');
      setEmailCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send an email verification code.');
    } finally {
      setPending(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setPending(true); setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const endpoint = factorRequired ? '/api/auth/two-factor/verify' : '/api/auth/login';
      const mobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(factorRequired ? { code: data.code } : { ...data, verificationMethod: mobileDevice ? 'email' : 'authenticator' }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? 'Unable to sign in. Check the app server and database, then try again.');

      if (!factorRequired && result?.requiresTwoFactor) {
        setVerificationMethod(result.verificationMethod);
        if (result.setupRequired && result.verificationMethod === 'authenticator') {
          const setupResponse = await fetch('/api/auth/two-factor/setup');
          const setup = await setupResponse.json().catch(() => null);
          if (!setupResponse.ok) throw new Error(setup?.error ?? 'Could not set up your authenticator. Sign in again.');
          setSetupSecret(setup.secret);
          setSetupUri(setup.otpauthUri);
        }
        setFactorRequired(true); setPending(false); return;
      }
      router.replace('/dashboard'); router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in'); setPending(false);
    }
  }

  return <main className="login-shell">
    <section className="login-brand-side">
      <div className="login-brand"><span className="brand-mark"><Plus size={23}/></span><span><b>pharma<span>care</span></b><small>PHARMACY MANAGEMENT</small></span></div>
      <div className="login-hero"><span className="eyebrow">CARE, CLOSE AT HAND</span><h1>Here for<br/>your health.</h1><p>A trusted pharmacy team, ready with the care and guidance you need.</p><div className="login-assurance"><ShieldCheck size={17}/><span>Private, secure access for your pharmacy team</span></div></div>
      <div className="login-copyright">© 2026 PharmaCare · Made for better health</div>
    </section>
    <section className="login-form-side">
      <div className="login-form-wrap">
        <div className="login-mobile-brand"><span className="brand-mark"><Plus size={20}/></span><b>pharma<span>care</span></b></div>
        <span className="eyebrow">{factorRequired ? 'TWO-FACTOR SECURITY' : 'PHARMACARE TEAM PORTAL'}</span>
        <h2>{factorRequired ? setupSecret && verificationMethod === 'authenticator' ? 'Secure your account' : 'Verify it’s you' : 'Welcome back'}</h2>
        <p className="login-intro">{factorRequired ? verificationMethod === 'email' ? 'Enter the 6-digit verification code sent to your account email.' : setupSecret ? 'Add PharmaCare to an authenticator app, then enter its 6-digit code.' : 'Enter the 6-digit code from your authenticator app.' : 'Sign in to continue to your pharmacy workspace.'}</p>
        {factorRequired && setupSecret && verificationMethod === 'authenticator' && <div className="login-totp-setup"><b>Scan to add PharmaCare</b><div className="login-totp-qr"><QRCodeSVG value={setupUri} size={184} level="M" includeMargin /></div><span>Open your authenticator app, choose to add an account, then scan this QR code. The QR is generated in your browser.</span><b>Or enter the setup key manually</b><code>{setupSecret}</code></div>}
        {factorRequired && emailCodeSent && verificationMethod === 'email' && <p className="login-email-confirmation" role="status"><Mail size={15}/> Code sent to the email address on your account.</p>}
        <form onSubmit={submit} className="login-form">
          {!factorRequired ? <>
            <label className="login-label">Work email<div className="login-input-wrap"><Mail size={17}/><input name="email" type="email" autoComplete="username" placeholder="you@pharmacy.com" required/></div></label>
            <label className="login-label">Password<div className="login-input-wrap"><LockKeyhole size={17}/><input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required/></div></label>
          </> : <label className="login-label">{verificationMethod === 'email' ? '6-digit email code' : '6-digit authenticator code'}<div className="login-input-wrap"><KeyRound size={17}/><input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required/></div></label>}
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="button button-primary login-submit" disabled={pending}>{pending ? 'Please wait…' : factorRequired ? 'Verify and continue' : 'Sign in'}{!pending && <ArrowRight size={17}/>}</button>
        </form>
        {factorRequired && verificationMethod === 'authenticator' && <button className="button button-secondary login-email-option" type="button" onClick={sendEmailCode} disabled={pending}><Mail size={16}/>{pending ? 'Sending code…' : 'Send a code to my email instead'}</button>}
        <p className="login-security"><LockKeyhole size={13}/> Password, authenticator code and role are checked securely.</p>
        <p className="signup-alternate">New to PharmaCare? <Link href="/signup">Create an account</Link></p>
      </div>
    </section>
  </main>;
}
