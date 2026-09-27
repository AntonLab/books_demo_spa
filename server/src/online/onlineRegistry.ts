import { NOTIFICATION_STREAM_EVENT, type PublicNotification } from 'shared';
import { logger } from '../logger.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';

// How often every open stream's session is re-checked. Also the keep-alive:
// each check that keeps a stream writes it a comment line, well inside the
// idle timeouts proxies apply to a quiet connection.
export const ONLINE_REVALIDATE_INTERVAL_MS = 30_000;

// One open notification stream (GET /api/notifications/stream), as the HTTP
// layer hands it over. The session's token hash is what revalidation checks.
export interface OnlineConnection {
  userId: number;
  tokenHash: string;
  write(chunk: string): void;
  close(): void;
}

// Who is Online (CONTEXT.md), held in this process's memory only: a second
// API instance would see none of these streams (ADR-0013).
export interface OnlineRegistry {
  add(connection: OnlineConnection): void;
  remove(connection: OnlineConnection): void;
  isOnline(userId: number): boolean;
  push(userId: number, notification: PublicNotification): void;
  // Closes every stream whose session no longer stands and pings the rest.
  // Never rejects.
  revalidate(): Promise<void>;
  start(): void;
  stop(): void;
}

export interface OnlineRegistryDeps {
  sessionRepository: Pick<SessionRepository, 'findLiveSessions'>;
}

export function notificationEvent(notification: PublicNotification): string {
  return `event: ${NOTIFICATION_STREAM_EVENT}\ndata: ${JSON.stringify(notification)}\n\n`;
}

const PING = ': ping\n\n';

export function createOnlineRegistry(deps: OnlineRegistryDeps): OnlineRegistry {
  const connections = new Set<OnlineConnection>();
  let timer: ReturnType<typeof setInterval> | undefined;

  const drop = (connection: OnlineConnection): void => {
    connections.delete(connection);
    connection.close();
  };

  const revalidate = async (): Promise<void> => {
    if (connections.size === 0) return;
    const checked = [...connections];
    try {
      const live = await deps.sessionRepository.findLiveSessions([
        ...new Set(checked.map((connection) => connection.tokenHash)),
      ]);
      for (const connection of checked) {
        // Closed by its client while the query ran: nothing left to do.
        if (!connections.has(connection)) continue;
        if (live.get(connection.tokenHash) === connection.userId) {
          connection.write(PING);
        } else {
          drop(connection);
        }
      }
    } catch (error) {
      // A database hiccup keeps every stream until the next check, rather
      // than signing every Account out of its live notifications.
      logger.error(
        'Online revalidation failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  return {
    add: (connection) => {
      connections.add(connection);
    },
    remove: (connection) => {
      connections.delete(connection);
    },
    isOnline: (userId) =>
      [...connections].some((connection) => connection.userId === userId),
    push: (userId, notification) => {
      const chunk = notificationEvent(notification);
      for (const connection of connections) {
        if (connection.userId === userId) connection.write(chunk);
      }
    },
    revalidate,
    // unref()ed so it never holds the process open; the graceful shutdown
    // calls stop().
    start: () => {
      if (timer) return;
      timer = setInterval(() => {
        void revalidate();
      }, ONLINE_REVALIDATE_INTERVAL_MS);
      timer.unref();
    },
    stop: () => {
      clearInterval(timer);
      timer = undefined;
      for (const connection of [...connections]) drop(connection);
    },
  };
}
