import type { Logger } from '../logger.ts';

export interface ResetDelivery {
  send(email: string, token: string): Promise<void>;
}

// The path is a contract with the client spec, which routes /reset-password to
// the confirm modal. The two must not drift.
export function resetUrl(baseUrl: string, token: string): string {
  const url = new URL('/reset-password', baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

// The only implementation. Real mail delivery is a second implementation of
// this interface and touches nothing else.
export function createLoggerResetDelivery(
  logger: Logger,
  baseUrl: string
): ResetDelivery {
  return {
    async send(email, token) {
      // The address is logged, the token only inside the URL — there is no
      // second copy of the credential in the log line.
      logger.info(`Password reset for ${email}: ${resetUrl(baseUrl, token)}`);
    },
  };
}
