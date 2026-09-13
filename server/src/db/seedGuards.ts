// The seed's safety check, kept apart from seed.ts because that file is a
// script: it ends in a top-level `await main()`, so a spec that imported it
// would run the seed. Only the target check moves here; the dry run, the other
// half of the seed's safety, is the shape of main() itself and stays there.

import { logger as defaultLogger, type Logger } from '../logger.ts';
import type { AppConfig } from './config.ts';

// The schema this seed is written for. Any other name needs --force, which is
// the same flag that authorises the delete — one gesture, two guards.
export const DEMO_DATABASE = 'books_demo_spa';

// The logger is a parameter only so a spec can record the warning; the seed
// passes nothing and logs through the shared one.
export function assertSafeTarget(
  config: AppConfig,
  force: boolean,
  logger: Logger = defaultLogger
): void {
  // Unconditional: no flag makes wiping a production database this script's
  // business.
  if (config.env === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV is production, and this script deletes rows.'
    );
  }

  if (force && config.db.database !== DEMO_DATABASE) {
    logger.warn(
      `--force given for a database other than ${DEMO_DATABASE}; every row in its content tables will be deleted`,
      { database: config.db.database }
    );
  }
}
