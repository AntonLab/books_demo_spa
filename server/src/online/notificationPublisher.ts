import type { Transaction } from 'sequelize';
import type { PublicNotification } from 'shared';
import { logger, messageOf } from '../logger.ts';

export type PublishNotification = (
  userId: number,
  notification: PublicNotification
) => void;

// Module state, not a dependency: repositories are built without deps, and
// the process holds exactly one Online registry (ADR-0013). Until index.ts
// sets it nothing is pushed, which is what the seed and the repository specs
// want.
let publish: PublishNotification | null = null;

export function setNotificationPublisher(
  next: PublishNotification | null
): void {
  publish = next;
}

// Runs once the transaction commits, so a push can never name a row that a
// rollback takes back. A failed push is logged and dropped: the Notification
// is stored either way, and the bell's polling still brings it. The try/catch
// matters: Sequelize awaits afterCommit hooks inside commit(), so a throw
// here would reject a change that has already committed.
export function publishAfterCommit(
  items: ReadonlyArray<{ userId: number; notification: PublicNotification }>,
  transaction: Transaction
): void {
  if (items.length === 0) return;
  transaction.afterCommit(() => {
    const current = publish;
    if (current === null) return;
    for (const { userId, notification } of items) {
      try {
        current(userId, notification);
      } catch (error) {
        logger.error('Could not push a notification', {
          userId,
          notificationId: notification.id,
          error: messageOf(error),
        });
      }
    }
  });
}
