import type { TestContext } from 'node:test';
import { logger } from './logger.ts';

export interface LogLine {
  level: 'info' | 'warn' | 'error';
  message: string;
  meta: unknown;
}

// Swaps the shared logger's methods for the test's lifetime, so a spec reads
// what a module logged and nothing reaches the console.
export function recordLogs(t: TestContext): LogLine[] {
  const lines: LogLine[] = [];
  for (const level of ['info', 'warn', 'error'] as const) {
    t.mock.method(logger, level, (message: string, meta?: unknown) => {
      lines.push({ level, message, meta });
    });
  }
  return lines;
}
