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
import { READING_STATUSES } from 'shared';
import type { PublicLibraryEntry, ReadingStatus } from 'shared';
import type { Book } from './Book.ts';
import type { User } from './User.ts';

export class LibraryEntry extends Model<
  InferAttributes<LibraryEntry>,
  InferCreationAttributes<LibraryEntry>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  declare bookId: ForeignKey<Book['id']>;
  declare status: ReadingStatus;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Populated only by an eager `include`.
  declare user?: NonAttribute<User>;
  declare book?: NonAttribute<Book>;
}

export function initLibraryEntryModel(
  sequelize: Sequelize
): typeof LibraryEntry {
  LibraryEntry.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // INTEGER UNSIGNED to match the referenced ids (errno 3780 otherwise).
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      bookId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      status: { type: DataTypes.ENUM(...READING_STATUSES), allowNull: false },
      // allowNull: false restated (see User.ts). Millisecond precision, so
      // "newest change first" does not tie.
      createdAt: { type: DataTypes.DATE(3), allowNull: false },
      updatedAt: { type: DataTypes.DATE(3), allowNull: false },
    },
    {
      sequelize,
      tableName: 'library_entries',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // A Book's Library counts. Also the index its foreign key needs.
        {
          name: 'library_entries_book_id_status',
          fields: ['bookId', 'status'],
        },
        // One entry per account per Book, enforced here instead of a findOne
        // before the insert. Leads with userId, which serves the foreign key.
        {
          name: 'library_entries_user_id_book_id',
          fields: ['userId', 'bookId'],
          unique: true,
        },
        // The Library list: one status, newest change first.
        {
          name: 'library_entries_user_id_status_updated_at',
          fields: ['userId', 'status', 'updatedAt'],
        },
      ],
    }
  );

  return LibraryEntry;
}

export function toPublicLibraryEntry(entry: LibraryEntry): PublicLibraryEntry {
  return {
    bookId: entry.bookId,
    status: entry.status,
    updatedAt: entry.updatedAt,
  };
}
