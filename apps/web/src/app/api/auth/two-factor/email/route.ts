import { sendPendingMfaEmailCode } from '@/lib/auth';

export async function POST() {
  try {
    await sendPendingMfaEmailCode();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'MFA_CHALLENGE_EXPIRED') {
      return Response.json({ error: 'Sign-in challenge expired. Sign in again.' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'MFA_EMAIL_ALREADY_SENT') {
      return Response.json({ error: 'An email code has already been sent for this sign-in. Enter that code to continue.' }, { status: 429 });
    }
    if (error instanceof Error && error.message === 'EMAIL_DELIVERY_FAILED') {
      return Response.json({ error: 'Could not send a verification code. Check the email service settings and try again.' }, { status: 503 });
    }
    console.error('Email verification code request failed:', error);
    return Response.json({ error: 'Could not send an email verification code.' }, { status: 503 });
  }
}
