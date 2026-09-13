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
import type { User } from './User.ts';

// One row per Co-author credit on a book. A join table rather than a column,
// because a book has no single owner (ADR-0005).
export class BookAuthor extends Model<
  InferAttributes<BookAuthor>,
  InferCreationAttributes<BookAuthor>
> {
  // The surrogate id is what orders a book's byline: DATETIME stores whole
  // seconds, so two co-authors added in the same second would tie on createdAt.
  declare id: CreationOptional<number>;
  declare bookId: ForeignKey<Book['id']>;
  declare userId: ForeignKey<User['id']>;
  declare createdAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;
}

export function initBookAuthorModel(sequelize: Sequelize): typeof BookAuthor {
  BookAuthor.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // Both must match their targets' INTEGER UNSIGNED exactly, or MySQL
      // rejects the foreign keys with errno 3780.
      bookId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'book_authors',
      // A credit is added or removed, never edited, so there is no updatedAt.
      timestamps: true,
      updatedAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // Uniqueness in the schema, not a findOne first: crediting the same
        // account twice surfaces as a UniqueConstraintError. Its leftmost
        // column also serves the bookId foreign key.
        {
          name: 'book_authors_book_id_user_id',
          unique: true,
          fields: ['bookId', 'userId'],
        },
        // Serves the userId foreign key and the "books this account
        // co-authors" lookup behind `?userId=`.
        { name: 'book_authors_user_id', fields: ['userId'] },
      ],
    }
  );

  return BookAuthor;
}
