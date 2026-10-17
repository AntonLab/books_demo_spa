import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { QueryInterface, Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

// Silent on purpose: callers log the names up() returns. The `.js` alternative
// keeps a tsc build from finding zero migrations; the default resolver uses
// require, which cannot load these ESM modules.
export function createMigrator(sequelize: Sequelize): Umzug<QueryInterface> {
  return new Umzug({
    migrations: {
      glob: [
        '*.{ts,js}',
        {
          cwd: path.join(import.meta.dirname, 'migrations'),
          // The parity spec lives beside the migrations and must not run as one.
          ignore: ['*.d.ts', '*.spec.*'],
        },
      ],
      resolve: ({ name, path: file, context }) => ({
        name,
        up: async () => {
          const migration = await import(pathToFileURL(file as string).href);
          await migration.up(context);
        },
      }),
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: undefined,
  });
}

export async function assertNoPendingMigrations(
  migrator: Umzug<QueryInterface>
): Promise<void> {
  const pending = await migrator.pending();
  if (pending.length > 0) {
    const names = pending.map((migration) => migration.name);
    throw new Error(
      `Pending migrations: ${names.join(', ')}. Run npm run migrate -w server`
    );
  }
}
