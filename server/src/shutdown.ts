import { logger, messageOf } from './logger.ts';

// How long a shutdown may take before it is forced.
export const SHUTDOWN_TIMEOUT_MS = 10_000;

// What the shutdown needs of the HTTP server; node:http's Server has it all.
interface ShutdownServer {
  close(callback: (error?: Error) => void): unknown;
  closeIdleConnections(): void;
  closeAllConnections(): void;
}

// Anything holding an interval the process must not outlive.
interface Stoppable {
  stop(): void;
}

export interface ShutdownDeps {
  // Absent when startup failed before listen; read at shutdown time, so it
  // may be assigned after the shutdown is created.
  server?: ShutdownServer;
  sequelize: { close(): Promise<void> };
  stoppables: readonly Stoppable[];
  // process.exit, for the forced and the failed paths only.
  exit: (code: number) => void;
}

// `stopping` is true once a shutdown has started, so a boot still in progress
// can see it and stop starting things on a closed pool.
export type Shutdown = ((reason: string) => Promise<void>) & {
  readonly stopping: boolean;
};

export function createShutdown(deps: ShutdownDeps): Shutdown {
  let running: Promise<void> | undefined;

  const run = async (reason: string): Promise<void> => {
    logger.info(`Shutting down (${reason})`);

    // unref()ed: the deadline must never be what keeps the process alive
    // once everything else has closed.
    setTimeout(() => {
      deps.server?.closeAllConnections();
      logger.error(
        `Shutdown did not finish within ${SHUTDOWN_TIMEOUT_MS} ms; forcing exit`
      );
      deps.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    try {
      for (const stoppable of deps.stoppables) {
        stoppable.stop();
      }

      // close() waits for the requests in flight. Its error only means the
      // server was not listening — a listen that failed — so there is
      // nothing left for it to close, and the error is not one.
      const { server } = deps;
      if (server) {
        const closed = new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
        server.closeIdleConnections();
        await closed;
      }

      await deps.sequelize.close();
      // process.exitCode is left alone: a clean shutdown ends with 0 (or with
      // whatever a failed listen already set), once nothing holds the loop.
      logger.info('Shutdown complete');
    } catch (error) {
      logger.error('Shutdown failed', messageOf(error));
      deps.exit(1);
    }
  };

  // One shutdown per process: the other signal joins the shutdown already
  // under way instead of starting another. A repeat of the same signal never
  // gets here — process.once has removed that listener, so Node's default
  // action takes it and ends the process at once.
  return Object.defineProperty(
    (reason: string) => {
      running ??= run(reason);
      return running;
    },
    // satisfies: the cast below cannot see a typo in the property name.
    'stopping' satisfies keyof Shutdown,
    { get: () => running !== undefined }
  ) as Shutdown;
}

// process.once, so each signal is heard once; the shutdown itself makes the
// pair idempotent. `node --watch` restarts with SIGTERM, so every dev restart
// takes this path too.
export function registerShutdownSignals(
  shutdown: (reason: string) => Promise<void>,
  target: Pick<NodeJS.EventEmitter, 'once'> = process
): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    target.once(signal, () => {
      void shutdown(signal);
    });
  }
}
