import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import type { Book } from './Book.ts';
import type { Series } from './Series.ts';
import type { User } from './User.ts';
import type { PublicFavorite } from 'shared';

export class Favorite extends Model<
  InferAttributes<Favorite>,
  InferCreationAttributes<Favorite>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  // Both nullable only so "exactly one" is expressible in two columns, as on
  // likes; the validator below holds the invariant.
  declare bookId: CreationOptional<ForeignKey<Book['id']> | null>;
  declare seriesId: CreationOptional<ForeignKey<Series['id']> | null>;
  declare createdAt: CreationOptional<Date>;

  // Populated only by an eager `include`.
  declare user?: NonAttribute<User>;
  declare book?: NonAttribute<Book>;
  declare series?: NonAttribute<Series>;
}

// A named function with an explicit `this`, so strict mode sees no implicit
// any. MySQL gets no CHECK for this (see .claude/rules/server/sequelize.md).
function exactlyOneTarget(this: Favorite): void {
  if ((this.bookId == null) === (this.seriesId == null)) {
    throw new Error('Exactly one of bookId or seriesId must be set');
  }
}

export function initFavoriteModel(sequelize: Sequelize): typeof Favorite {
  Favorite.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // INTEGER UNSIGNED like the ids they reference, or MySQL rejects the
      // foreign key with errno 3780.
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      bookId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      seriesId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      // Declaring the timestamp opts out of Sequelize's implicit NOT NULL.
      createdAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'favorites',
      timestamps: true,
      updatedAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      validate: { exactlyOneTarget },
      indexes: [
        // A work's favoriteCount, and the holders an announcement goes to
        // (part 2), look a target up by itself. Each is also the index its
        // foreign key needs, so InnoDB adds no second one.
        { name: 'favorites_book_id', fields: ['bookId'] },
        { name: 'favorites_series_id', fields: ['seriesId'] },
        // One favorite per account per work, enforced here instead of a
        // findOne before the insert. NULLs are distinct in a unique index, so
        // the two pairs do not interfere. Both lead with userId, which serves
        // the account's own lists.
        {
          name: 'favorites_user_id_book_id',
          fields: ['userId', 'bookId'],
          unique: true,
        },
        {
          name: 'favorites_user_id_series_id',
          fields: ['userId', 'seriesId'],
          unique: true,
        },
      ],
    }
  );

  return Favorite;
}

export function toPublicFavorite(favorite: Favorite): PublicFavorite {
  return {
    id: favorite.id,
    userId: favorite.userId,
    // An unset optional key is undefined on a freshly built instance; the API
    // promises null.
    bookId: favorite.bookId ?? null,
    seriesId: favorite.seriesId ?? null,
    createdAt: favorite.createdAt,
  };
}
