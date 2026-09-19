import type { Logger } from './logger.ts';

// How long a shutdown may take before it is forced.
export const SHUTDOWN_TIMEOUT_MS = 10_000;

// What the shutdown needs of the HTTP server; node:http's Server has it all.
export interface ShutdownServer {
  close(callback: (error?: Error) => void): unknown;
  closeIdleConnections(): void;
  closeAllConnections(): void;
}

// Anything holding an interval the process must not outlive.
export interface Stoppable {
  stop(): void;
}

export interface ShutdownTimer {
  unref(): unknown;
}

export interface ShutdownDeps {
  server: ShutdownServer;
  sequelize: { close(): Promise<void> };
  stoppables: readonly Stoppable[];
  logger: Logger;
  // process.exit, for the forced and the failed paths only.
  exit: (code: number) => void;
  // setTimeout, injectable so a spec fires the deadline itself.
  setTimer?: (callback: () => void, ms: number) => ShutdownTimer;
  timeoutMs?: number;
}

export type Shutdown = (reason: string) => Promise<void>;

export function createShutdown(deps: ShutdownDeps): Shutdown {
  const timeoutMs = deps.timeoutMs ?? SHUTDOWN_TIMEOUT_MS;
  const setTimer =
    deps.setTimer ??
    ((callback: () => void, ms: number): ShutdownTimer =>
      setTimeout(callback, ms));
  let running: Promise<void> | undefined;

  const run = async (reason: string): Promise<void> => {
    deps.logger.info(`Shutting down (${reason})`);

    // unref()ed: the deadline must never be what keeps the process alive
    // once everything else has closed.
    setTimer(() => {
      deps.server.closeAllConnections();
      deps.logger.error(
        `Shutdown did not finish within ${timeoutMs} ms; forcing exit`
      );
      deps.exit(1);
    }, timeoutMs).unref();

    try {
      for (const stoppable of deps.stoppables) {
        stoppable.stop();
      }

      // close() waits for the requests in flight. Its error only means the
      // server was not listening — a listen that failed — so there is
      // nothing left for it to close, and the error is not one.
      const closed = new Promise<void>((resolve) => {
        deps.server.close(() => resolve());
      });
      deps.server.closeIdleConnections();
      await closed;

      await deps.sequelize.close();
      // process.exitCode is left alone: a clean shutdown ends with 0 (or with
      // whatever a failed listen already set), once nothing holds the loop.
      deps.logger.info('Shutdown complete');
    } catch (error) {
      deps.logger.error(
        'Shutdown failed',
        error instanceof Error ? error.message : String(error)
      );
      deps.exit(1);
    }
  };

  // One shutdown per process: the other signal joins the shutdown already
  // under way instead of starting another. A repeat of the same signal never
  // gets here — process.once has removed that listener, so Node's default
  // action takes it and ends the process at once.
  return (reason) => {
    running ??= run(reason);
    return running;
  };
}

// process.once, so each signal is heard once; the shutdown itself makes the
// pair idempotent. `node --watch` restarts with SIGTERM, so every dev restart
// takes this path too.
export function registerShutdownSignals(
  shutdown: Shutdown,
  target: Pick<NodeJS.EventEmitter, 'once'> = process
): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    target.once(signal, () => {
      void shutdown(signal);
    });
  }
}
