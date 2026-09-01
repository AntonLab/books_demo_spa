import { Sequelize } from 'sequelize';
import type { DbConfig } from './config.ts';

export function createSequelize(db: DbConfig): Sequelize {
  return new Sequelize(db.database, db.username, db.password, {
    host: db.host,
    port: db.port,
    dialect: 'mysql',
    logging: false,
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
    },
  });
}
