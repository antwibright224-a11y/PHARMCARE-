import 'server-only';
import nodemailer from 'nodemailer';

export async function sendSignInCode(email: string, code: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from) {
    throw new Error('EMAIL_DELIVERY_FAILED');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: 'Your PharmaCare sign-in code',
      text: `Your PharmaCare verification code is ${code}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
      html: `<p>Your PharmaCare verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p>`,
    });
  } catch {
    throw new Error('EMAIL_DELIVERY_FAILED');
  } finally {
    transporter.close();
  }
}
