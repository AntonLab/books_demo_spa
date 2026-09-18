// A fixed-window rate limiter kept in memory. No dependency and no database:
// counts live in this process only, and a restart forgets them.

export interface RateLimitState {
  // For hit: whether this request is within the limit. For peek: whether one
  // more request would be.
  allowed: boolean;
  // Milliseconds until the key's window closes; 0 when it has none open.
  retryAfterMs: number;
}

export interface RateLimiter {
  // Counts one request against the key and reports the state after it.
  hit(key: string): RateLimitState;
  // Reports the key's state without counting anything.
  peek(key: string): RateLimitState;
  // Gives back one hit that turned out not to count, such as a request that
  // was tentatively counted on arrival but did not end in the outcome the
  // budget tracks. Floors at 0 and never touches the window's end; a no-op
  // when the key holds no open window.
  release(key: string): void;
  // Forgets the key's window.
  reset(key: string): void;
  // How many keys hold an open window — what the sweep keeps bounded.
  size(): number;
  // Clears the sweep's interval.
  stop(): void;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  // Date.now, injectable so a spec moves time by hand.
  now?: () => number;
}

interface Window {
  count: number;
  endsAt: number;
}

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  const windows = new Map<string, Window>();

  // The lazy half of the cleanup: a window is dropped the moment its key is
  // touched after it ended.
  const current = (key: string, at: number): Window | undefined => {
    const window = windows.get(key);
    if (window !== undefined && window.endsAt <= at) {
      windows.delete(key);
      return undefined;
    }
    return window;
  };

  // The other half: keys never touched again are swept once a window, so
  // memory stays bounded by the keys seen in one window. unref() so the
  // interval never holds the process open.
  const sweep = (): void => {
    const at = now();
    for (const [key, window] of windows) {
      if (window.endsAt <= at) {
        windows.delete(key);
      }
    }
  };
  const timer = setInterval(sweep, windowMs);
  timer.unref();

  return {
    hit(key) {
      const at = now();
      const window = current(key, at);
      const next: Window = {
        count: (window?.count ?? 0) + 1,
        endsAt: window?.endsAt ?? at + windowMs,
      };
      windows.set(key, next);
      return { allowed: next.count <= limit, retryAfterMs: next.endsAt - at };
    },

    peek(key) {
      const at = now();
      const window = current(key, at);
      if (window === undefined) {
        return { allowed: true, retryAfterMs: 0 };
      }
      return {
        allowed: window.count < limit,
        retryAfterMs: window.endsAt - at,
      };
    },

    release(key) {
      const at = now();
      const window = current(key, at);
      if (window === undefined) {
        return;
      }
      windows.set(key, {
        count: Math.max(0, window.count - 1),
        endsAt: window.endsAt,
      });
    },

    reset(key) {
      windows.delete(key);
    },

    size: () => windows.size,

    stop() {
      clearInterval(timer);
    },
  };
}
