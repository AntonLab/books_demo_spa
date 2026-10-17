import { NOTIFICATION_STREAM_EVENT, type PublicNotification } from 'shared';
import { logger, messageOf } from '../logger.ts';
import type { SessionRepository } from '../repositories/sessionRepository.ts';

// How often every open stream's session is re-checked. Also the keep-alive:
// each check that keeps a stream writes it a comment line, well inside the
// idle timeouts proxies apply to a quiet connection.
export const ONLINE_REVALIDATE_INTERVAL_MS = 30_000;

// Streams one Account may hold at once. Past it the new stream is refused, never
// an old one closed: a closed stream's EventSource reconnects and would evict
// the next, forever.
export const MAX_STREAMS_PER_ACCOUNT = 10;

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
  // False when the Account already holds MAX_STREAMS_PER_ACCOUNT other streams.
  add(connection: OnlineConnection): boolean;
  remove(connection: OnlineConnection): void;
  isOnline(userId: number): boolean;
  push(userId: number, notification: PublicNotification): void;
  // Closes every stream whose session no longer stands and pings the rest.
  // Never rejects.
  revalidate(): Promise<void>;
  start(): void;
  stop(): void;
}

interface OnlineRegistryDeps {
  sessionRepository: Pick<SessionRepository, 'findLiveSessions'>;
}

export function notificationEvent(notification: PublicNotification): string {
  return `event: ${NOTIFICATION_STREAM_EVENT}\ndata: ${JSON.stringify(notification)}\n\n`;
}

const PING = ': ping\n\n';

export function createOnlineRegistry(deps: OnlineRegistryDeps): OnlineRegistry {
  // Entries exist only while their set is non-empty.
  const byUser = new Map<number, Set<OnlineConnection>>();
  let timer: ReturnType<typeof setInterval> | undefined;

  const release = (connection: OnlineConnection): void => {
    const streams = byUser.get(connection.userId);
    if (!streams) return;
    streams.delete(connection);
    if (streams.size === 0) byUser.delete(connection.userId);
  };

  const drop = (connection: OnlineConnection): void => {
    release(connection);
    connection.close();
  };

  const revalidate = async (): Promise<void> => {
    if (byUser.size === 0) return;
    const checked = [...byUser.values()].flatMap((set) => [...set]);
    try {
      const live = await deps.sessionRepository.findLiveSessions([
        ...new Set(checked.map((connection) => connection.tokenHash)),
      ]);
      for (const connection of checked) {
        // Closed by its client while the query ran: nothing left to do.
        if (!byUser.get(connection.userId)?.has(connection)) continue;
        if (live.get(connection.tokenHash) === connection.userId) {
          connection.write(PING);
        } else {
          drop(connection);
        }
      }
    } catch (error) {
      // A database hiccup keeps every stream until the next check, rather
      // than signing every Account out of its live notifications.
      logger.error('Online revalidation failed', messageOf(error));
    }
  };

  return {
    add: (connection) => {
      const streams = byUser.get(connection.userId);
      if (
        streams &&
        !streams.has(connection) &&
        streams.size >= MAX_STREAMS_PER_ACCOUNT
      ) {
        return false;
      }
      if (streams) streams.add(connection);
      else byUser.set(connection.userId, new Set([connection]));
      return true;
    },
    remove: release,
    isOnline: (userId) => byUser.has(userId),
    push: (userId, notification) => {
      const chunk = notificationEvent(notification);
      for (const connection of byUser.get(userId) ?? []) {
        connection.write(chunk);
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
      for (const streams of [...byUser.values()]) {
        for (const connection of [...streams]) drop(connection);
      }
    },
  };
}
