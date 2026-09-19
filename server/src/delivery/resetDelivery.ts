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

// What RESET_DELIVERY may name. One entry today; real mail would be a second
// kind here and a second ResetDelivery implementation above.
export const RESET_DELIVERY_KINDS = ['log'] as const;
export type ResetDeliveryKind = (typeof RESET_DELIVERY_KINDS)[number];

const DELIVERIES: Record<
  ResetDeliveryKind,
  (logger: Logger, baseUrl: string) => ResetDelivery
> = {
  log: createLoggerResetDelivery,
};

// The delivery RESET_DELIVERY names; index.ts builds it from the config
// rather than hard-wiring the log.
export function createResetDelivery(
  kind: ResetDeliveryKind,
  logger: Logger,
  baseUrl: string
): ResetDelivery {
  return DELIVERIES[kind](logger, baseUrl);
}
