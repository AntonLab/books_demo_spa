// The single sanctioned console boundary: every other module logs through this one.

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

export const logger = {
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
