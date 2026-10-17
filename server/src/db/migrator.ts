import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { QueryInterface, Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

// Silent: callers log the names up() returns. Globs .js as well as .ts so a tsc
// build finds its migrations. Custom resolve uses import(): the default
// resolver uses require, which cannot load ESM.
export function createMigrator(sequelize: Sequelize): Umzug<QueryInterface> {
  return new Umzug({
    migrations: {
      glob: [
        '*.{ts,js}',
        {
          cwd: path.join(import.meta.dirname, 'migrations'),
          // Skip specs: they sit beside the migrations.
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
