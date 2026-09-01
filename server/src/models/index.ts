import type { Sequelize } from 'sequelize';
import { initUserModel, User } from './User.ts';

export function initModels(sequelize: Sequelize): { User: typeof User } {
  initUserModel(sequelize);
  return { User };
}

export { User, toPublicUser } from './User.ts';
