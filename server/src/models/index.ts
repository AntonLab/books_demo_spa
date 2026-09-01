import type { Sequelize } from 'sequelize';
import { initSeriesModel, Series } from './Series.ts';
import { initUserModel, User } from './User.ts';

export interface Models {
  User: typeof User;
  Series: typeof Series;
}

export function initModels(sequelize: Sequelize): Models {
  initUserModel(sequelize);
  initSeriesModel(sequelize);

  // Associations are declared after every model is initialised, so the target
  // is always a registered model no matter what order the files load in.
  User.hasMany(Series, {
    as: 'series',
    foreignKey: 'userId',
    // Deleting a user takes their series with them; nothing else references
    // them, and an orphaned series has no owner to answer for it.
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Series.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  return { User, Series };
}

export { User, toPublicUser } from './User.ts';
export { Series, toPublicSeries } from './Series.ts';
