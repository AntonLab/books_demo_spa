// The single sanctioned console boundary: every other module logs through this one.

export interface LogSink {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

type Level = 'info' | 'warn' | 'error';

export function createLogger(sink: LogSink = console): Logger {
  const emit = (level: Level, message: string, meta?: unknown): void => {
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
    if (meta === undefined) {
      sink[level](line);
    } else {
      sink[level](line, meta);
    }
  };

  return {
    info: (message, meta) => emit('info', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    error: (message, meta) => emit('error', message, meta),
  };
}

export const logger: Logger = createLogger();
