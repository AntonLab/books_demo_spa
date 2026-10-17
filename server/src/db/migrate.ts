import { loadConfig } from './config.ts';
import { ensureDatabase } from './ensureDatabase.ts';
import { createMigrator } from './migrator.ts';
import { createSequelize } from './sequelize.ts';
import { logger, messageOf } from '../logger.ts';

// The production way to apply migrations: boot refuses to start while any are
// pending. Outside production it also creates the schema, like index.ts.
async function main(): Promise<void> {
  const config = loadConfig();
  if (config.env !== 'production') {
    await ensureDatabase(config.db);
  }

  const sequelize = createSequelize(config.db);
  try {
    await sequelize.authenticate();
    const applied = await createMigrator(sequelize).up();
    if (applied.length === 0) {
      logger.info('No pending migrations');
    }
    for (const migration of applied) {
      logger.info(`Applied ${migration.name}`);
    }
  } finally {
    await sequelize.close();
  }
}

await main().catch((error: unknown) => {
  logger.error('Migration failed', messageOf(error));
  process.exitCode = 1;
});
