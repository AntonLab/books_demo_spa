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
import type { ChapterSummary, PublicChapter } from '../types/chapter.ts';

export class Chapter extends Model<
  InferAttributes<Chapter>,
  InferCreationAttributes<Chapter>
> {
  declare id: CreationOptional<number>;
  // Not nullable and not creation-optional, unlike books.seriesId: a chapter
  // only exists as part of a book.
  declare bookId: ForeignKey<Book['id']>;
  declare title: string;
  declare text: string;
  // The Publication time (CONTEXT.md): null for a Draft chapter, a future
  // moment for a Scheduled one, a past one once it is Published. Nothing flips
  // a flag when the moment passes — every read compares it with the clock.
  declare publishedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Populated only by an eager `include`; NonAttribute keeps it out of the
  // inferred attribute set so it is never mistaken for a column.
  declare book?: NonAttribute<Book>;
}

export function initChapterModel(sequelize: Sequelize): typeof Chapter {
  Chapter.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // Must match books.id exactly (INTEGER UNSIGNED) or MySQL rejects the
      // foreign key with errno 3780 on incompatible column types.
      bookId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      // MEDIUMTEXT, not the TEXT used for the descriptions on series and
      // books: TEXT holds 65,535 *bytes*, which under utf8mb4 is as little as
      // ~16k characters, and a chapter of a novel runs past that easily. MySQL
      // would truncate (or, in strict mode, reject) at the boundary.
      text: {
        type: DataTypes.TEXT('medium'),
        allowNull: false,
      },
      // See User.ts: declaring the timestamps ourselves opts out of Sequelize's
      // implicit NOT NULL, so it is restated here.
      // Millisecond precision, like updatedAt below: a chapter scheduled for
      // 18:00:00.500 is not out at 18:00:00.
      publishedAt: { type: DataTypes.DATE(3), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      // Millisecond precision rather than the whole seconds every other table
      // keeps: a save carries the updatedAt it last saw (chapterRepository
      // update), and two Co-authors saving within one second would otherwise
      // read as the same version and silently overwrite each other.
      updatedAt: { type: DataTypes.DATE(3), allowNull: false },
    },
    {
      sequelize,
      tableName: 'chapters',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // Serves the `?bookId=` filter together with the list endpoint's
        // `ORDER BY id`, so neither needs a filesort. It is also a leftmost
        // prefix of the foreign key's column, so InnoDB reuses it instead of
        // creating a second index for the constraint.
        { name: 'chapters_book_id_id', fields: ['bookId', 'id'] },
      ],
    }
  );

  return Chapter;
}

export function toPublicChapter(chapter: Chapter): PublicChapter {
  return {
    id: chapter.id,
    bookId: chapter.bookId,
    title: chapter.title,
    text: chapter.text,
    publishedAt: chapter.publishedAt ?? null,
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
  };
}

// The list projection. The body is dropped here rather than at the call site
// so that a MEDIUMTEXT column can never be paged out twenty rows at a time;
// chapterRepository.list also leaves the column out of the SELECT, so the
// value is absent rather than fetched and discarded.
export function toChapterSummary(chapter: Chapter): ChapterSummary {
  return {
    id: chapter.id,
    bookId: chapter.bookId,
    title: chapter.title,
    publishedAt: chapter.publishedAt ?? null,
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
  };
}
