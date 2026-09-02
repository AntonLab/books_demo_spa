import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp, type AppDeps } from '../app.ts';

// The five route specs each drive one resource; createApp still requires the
// others. Stubs that throw keep that assumption honest rather than silently
// returning undefined.
export function createUnusedRepository<T>(name: string): T {
  const unreachable = (): never => {
    throw new Error(`the ${name} repository must not be used by these tests`);
  };

  return {
    create: unreachable,
    list: unreachable,
    findById: unreachable,
    update: unreachable,
    remove: unreachable,
  } as T;
}

function defaultDeps(): AppDeps {
  return {
    userRepository: createUnusedRepository('user'),
    seriesRepository: createUnusedRepository('series'),
    bookRepository: createUnusedRepository('book'),
    chapterRepository: createUnusedRepository('chapter'),
    likeRepository: createUnusedRepository('like'),
  };
}

// Binds an ephemeral port so suites can run in parallel without collisions.
export async function withApp(
  overrides: Partial<AppDeps>,
  fn: (base: string) => Promise<void>
): Promise<void> {
  const app = createApp({ ...defaultDeps(), ...overrides });
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// undici's Body.json() returns Promise<unknown>; this is the single place the
// tests narrow it, mirroring validatedBody/Query/Params in validate.ts.
export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
