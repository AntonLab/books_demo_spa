import { rmSync } from 'node:fs';

// Codes Windows gives while a process still holds the directory open.
const HELD = new Set(['EPERM', 'EBUSY']);

/**
 * Deletes a worktree directory. Returns null once it is gone, or the message
 * to print when a process still holds it; any other failure throws. The
 * retries cover a process that is just exiting.
 */
export function removeDir(target, rm = rmSync) {
  try {
    rm(target, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 500,
    });
    return null;
  } catch (error) {
    if (!HELD.has(error.code)) throw error;
    return (
      `worktree: cannot delete ${target} (${error.code}): a process still holds it. ` +
      'Stop the UI-check server (ports 3100/4100), close the browser and any ' +
      'terminal or editor tab inside it, then run --remove again.'
    );
  }
}
