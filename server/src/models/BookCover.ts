import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { Book } from './Book.ts';

// A Book's Cover (CONTEXT.md, ADR-0007): one optional picture per Book, kept
// out of the books table itself so no list or detail query can drag the
// bytes along — the same reason chapters.text is left out of the chapter
// list. bookId is the primary key: there is at most one Cover per Book, and
// last write wins is the deliberate answer to two Co-authors replacing
// it at once, so there is no application-level lock here.
export class BookCover extends Model<
  InferAttributes<BookCover>,
  InferCreationAttributes<BookCover>
> {
  declare bookId: ForeignKey<Book['id']>;
  declare data: Buffer;
  declare updatedAt: CreationOptional<Date>;
}

export function initBookCoverModel(sequelize: Sequelize): typeof BookCover {
  BookCover.init(
    {
      // Must match books.id exactly (INTEGER UNSIGNED) or MySQL rejects the
      // foreign key with errno 3780. No autoIncrement: this column *is* the
      // link to the Book it belongs to.
      bookId: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
      },
      // Always re-encoded WebP (src/images.ts), so there is no
      // content-type column to carry — every stored picture is the same
      // format. MEDIUMBLOB holds up to 16 MB, far past a 600x900 WebP.
      data: {
        type: DataTypes.BLOB('medium'),
        allowNull: false,
      },
      // Millisecond precision for the same reason chapters.updatedAt has
      // it: two Co-authors replacing the Cover within one second would
      // otherwise version-tie, and the cache-busting coverUrl depends on this
      // value actually changing.
      updatedAt: { type: DataTypes.DATE(3), allowNull: false },
    },
    {
      sequelize,
      tableName: 'book_covers',
      // A replace overwrites in place, so only the moment of the current
      // version matters — no createdAt.
      timestamps: true,
      createdAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
    }
  );

  return BookCover;
}
