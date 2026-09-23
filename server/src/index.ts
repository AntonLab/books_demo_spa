import { createApp } from './app.ts';
import { createLoggerResetDelivery } from './delivery/resetDelivery.ts';
import { loadConfig } from './db/config.ts';
import { ensureDatabase } from './db/ensureDatabase.ts';
import { createSequelize } from './db/sequelize.ts';
import { startExpiryPurge } from './expiryPurge.ts';
import { listen } from './listen.ts';
import { logger } from './logger.ts';
import { createAuthRateLimits } from './middleware/authRateLimit.ts';
import { initModels } from './models/index.ts';
import { syncPermissions } from './permissions/permissionStore.ts';
import { createSequelizeBookRepository } from './repositories/bookRepository.ts';
import { createSequelizeChapterRepository } from './repositories/chapterRepository.ts';
import { createSequelizeCommentRepository } from './repositories/commentRepository.ts';
import { createSequelizeGenreRepository } from './repositories/genreRepository.ts';
import { createSequelizeLikeRepository } from './repositories/likeRepository.ts';
import { createSequelizeNotificationRepository } from './repositories/notificationRepository.ts';
import { createSequelizePasswordResetRepository } from './repositories/passwordResetRepository.ts';
import { createSequelizeSessionRepository } from './repositories/sessionRepository.ts';
import { createSequelizeSeriesRepository } from './repositories/seriesRepository.ts';
import { createSequelizeUserRepository } from './repositories/userRepository.ts';
import { createShutdown, registerShutdownSignals } from './shutdown.ts';

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

  // The matrix is reference data derived from code, so it is written on every
  // boot and read back into memory. Requests do not depend on this — the store
  // already answers from the code before any sync — but it is still the call
  // that notices a missing `permissions` table. That means the schema was
  // never provisioned, and failing loudly at boot beats discovering it later.
  await syncPermissions();

  const sessionRepository = createSequelizeSessionRepository();
  const passwordResetRepository = createSequelizePasswordResetRepository();
  // After syncPermissions(): by now the schema is known to be provisioned.
  const expiryPurge = startExpiryPurge({
    sessionRepository,
    passwordResetRepository,
    logger,
  });
  const authRateLimits = createAuthRateLimits();

  const app = createApp({
    userRepository: createSequelizeUserRepository(),
    seriesRepository: createSequelizeSeriesRepository(),
    bookRepository: createSequelizeBookRepository(),
    chapterRepository: createSequelizeChapterRepository(),
    genreRepository: createSequelizeGenreRepository(),
    commentRepository: createSequelizeCommentRepository(),
    likeRepository: createSequelizeLikeRepository(),
    notificationRepository: createSequelizeNotificationRepository(),
    sessionRepository,
    passwordResetRepository,
    resetDelivery: createLoggerResetDelivery(logger, config.appBaseUrl),
    trustedOrigin: config.appBaseUrl,
    trustProxy: config.trustProxy,
    authRateLimits,
  });
  const server = listen(app, config.port, {
    logger,
    // Binding fails asynchronously, after this statement returns, so
    // `shutdown` below exists by the time this runs. The shutdown closes the
    // pool, and the process then exits with the code set here.
    onError: () => {
      process.exitCode = 1;
      void shutdown('the HTTP server could not start');
    },
  });

  const shutdown = createShutdown({
    server,
    sequelize,
    stoppables: [expiryPurge, authRateLimits],
    logger,
    exit: (code) => process.exit(code),
  });
  registerShutdownSignals(shutdown);
}

await main().catch((error: unknown) => {
  logger.error(
    'Fatal error during startup',
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
