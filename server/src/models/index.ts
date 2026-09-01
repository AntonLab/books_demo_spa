import type { Sequelize } from 'sequelize';
import { initBookModel, Book } from './Book.ts';
import { initSeriesModel, Series } from './Series.ts';
import { initUserModel, User } from './User.ts';

export interface Models {
  User: typeof User;
  Series: typeof Series;
  Book: typeof Book;
}

export function initModels(sequelize: Sequelize): Models {
  initUserModel(sequelize);
  initSeriesModel(sequelize);
  initBookModel(sequelize);

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

  User.hasMany(Book, {
    as: 'books',
    foreignKey: 'userId',
    // Same reasoning as series: a book with no owner answers to nobody.
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  });
  Book.belongsTo(User, { as: 'user', foreignKey: 'userId' });

  Series.hasMany(Book, {
    as: 'books',
    // allowNull is restated here so Sequelize does not infer NOT NULL from the
    // association and quietly make SET NULL illegal.
    foreignKey: { name: 'seriesId', allowNull: true },
    // Not CASCADE, unlike the two above: seriesId is optional, so a book can
    // stand alone. Dropping the series unlinks its books rather than
    // destroying records the user never asked to delete.
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  });
  Book.belongsTo(Series, { as: 'series', foreignKey: 'seriesId' });

  return { User, Series, Book };
}

export { User, toPublicUser } from './User.ts';
export { Series, toPublicSeries } from './Series.ts';
export { Book, toPublicBook } from './Book.ts';
