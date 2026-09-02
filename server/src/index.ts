import { createApp } from './app.ts';
import { createLoggerResetDelivery } from './delivery/resetDelivery.ts';
import { loadConfig } from './db/config.ts';
import { ensureDatabase } from './db/ensureDatabase.ts';
import { createSequelize } from './db/sequelize.ts';
import { logger } from './logger.ts';
import { initModels } from './models/index.ts';
import { createSequelizeBookRepository } from './repositories/bookRepository.ts';
import { createSequelizeChapterRepository } from './repositories/chapterRepository.ts';
import { createSequelizeLikeRepository } from './repositories/likeRepository.ts';
import { createSequelizePasswordResetRepository } from './repositories/passwordResetRepository.ts';
import { createSequelizeSessionRepository } from './repositories/sessionRepository.ts';
import { createSequelizeSeriesRepository } from './repositories/seriesRepository.ts';
import { createSequelizeUserRepository } from './repositories/userRepository.ts';

function loadLocalEnv(): void {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    logger.warn('.env.local not found; relying on the ambient environment');
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const config = loadConfig();

  // Sequelize cannot create its own schema, and creating one is not the
  // application's business in production.
  if (config.env !== 'production') {
    await ensureDatabase(config.db);
  }

  const sequelize = createSequelize(config.db);
  initModels(sequelize);

  // A rejection here stops the process: never continue into a server with no
  // database.
  await sequelize.authenticate();

  if (config.env !== 'production') {
    await sequelize.sync();
  }

  const app = createApp({
    userRepository: createSequelizeUserRepository(),
    seriesRepository: createSequelizeSeriesRepository(),
    bookRepository: createSequelizeBookRepository(),
    chapterRepository: createSequelizeChapterRepository(),
    likeRepository: createSequelizeLikeRepository(),
    sessionRepository: createSequelizeSessionRepository(),
    passwordResetRepository: createSequelizePasswordResetRepository(),
    resetDelivery: createLoggerResetDelivery(logger, config.appBaseUrl),
  });
  app.listen(config.port, () => {
    logger.info(`server listening on http://127.0.0.1:${config.port}`);
  });
}

await main().catch((error: unknown) => {
  logger.error(
    'Fatal error during startup',
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
