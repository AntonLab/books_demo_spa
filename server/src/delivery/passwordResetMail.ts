import type { MailMessage } from './mailDelivery.ts';

// The path is a contract with the client spec, which routes /reset-password to
// the confirm modal. The two must not drift.
export function resetUrl(baseUrl: string, token: string): string {
  const url = new URL('/reset-password', baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

// The token travels only inside the link: a second bare copy in the text would
// be one more place a forwarded mail leaks it.
export function passwordResetMail(
  baseUrl: string,
  email: string,
  token: string
): MailMessage {
  return {
    to: email,
    subject: 'Reset your password',
    text: [
      'Someone asked to reset the password of your account.',
      '',
      'Choose a new password here (the link works for one hour):',
      resetUrl(baseUrl, token),
      '',
      'If it was not you, ignore this email: your password stays as it is.',
    ].join('\n'),
  };
}
