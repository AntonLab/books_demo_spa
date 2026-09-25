// The single sanctioned console boundary: every other module logs through this one.

export interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

type Level = 'info' | 'warn' | 'error';

const emit = (level: Level, message: string, meta?: unknown): void => {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  // eslint-disable-next-line no-console -- the boundary named above
  const write = console[level];
  if (meta === undefined) {
    write(line);
  } else {
    write(line, meta);
  }
};

export const logger: Logger = {
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta),
};
