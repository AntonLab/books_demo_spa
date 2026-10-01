import { NOTIFICATION_READ_TTL_MS } from 'shared';
import { logger } from './logger.ts';
import type { NotificationRepository } from './repositories/notificationRepository.ts';
import {
  RESET_TOKEN_RETENTION_MS,
  type PasswordResetRepository,
} from './repositories/passwordResetRepository.ts';
import type { SessionRepository } from './repositories/sessionRepository.ts';

export const EXPIRY_PURGE_INTERVAL_MS = 60 * 60 * 1000;

export interface ExpiryPurgeDeps {
  sessionRepository: Pick<SessionRepository, 'deleteExpired'>;
  passwordResetRepository: Pick<PasswordResetRepository, 'deleteExpiredBefore'>;
  notificationRepository: Pick<NotificationRepository, 'deleteReadBefore'>;
}

interface ExpiryPurge {
  stop(): void;
}

// One pass: sessions nothing will accept again, reset tokens a month past
// their own expiry, and Notifications the list already hides because they
// were read over NOTIFICATION_READ_TTL_MS ago. Never rejects — a failure is logged and the next pass
// tries again, so a database hiccup cannot take the process down.
export async function purgeExpiredRows(deps: ExpiryPurgeDeps): Promise<void> {
  const now = Date.now();
  try {
    const sessions = await deps.sessionRepository.deleteExpired(new Date(now));
    const resetTokens = await deps.passwordResetRepository.deleteExpiredBefore(
      new Date(now - RESET_TOKEN_RETENTION_MS)
    );
    const notifications = await deps.notificationRepository.deleteReadBefore(
      new Date(now - NOTIFICATION_READ_TTL_MS)
    );
    if (sessions > 0 || resetTokens > 0 || notifications > 0) {
      logger.info('Purged expired rows', {
        sessions,
        resetTokens,
        notifications,
      });
    }
  } catch (error) {
    logger.error(
      'Expiry purge failed',
      error instanceof Error ? error.message : String(error)
    );
  }
}

// One pass at boot, then one per interval. The interval is unref()ed so it
// never holds the process open; the graceful shutdown stops it.
export function startExpiryPurge(deps: ExpiryPurgeDeps): ExpiryPurge {
  const run = (): void => {
    // void: purgeExpiredRows never rejects, and nothing waits on a pass.
    void purgeExpiredRows(deps);
  };

  run();
  const timer = setInterval(run, EXPIRY_PURGE_INTERVAL_MS);
  timer.unref();

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
