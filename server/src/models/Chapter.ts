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
import type { ChapterSummary, PublicChapter } from 'shared';

// The one place a chapter's words are counted: the text setter below calls it,
// so the repository and the seed cannot disagree. A word is a run of
// non-whitespace. Counted by stepping the regex, not with split() or match():
// a chapter may hold a million characters, and both build an array of every
// word only to read its length.
export function countWords(text: string): number {
  const word = /\S+/g;
  let count = 0;
  while (word.exec(text) !== null) count += 1;
  return count;
}

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
  // The chapter's place in its book's Reading order (CONTEXT.md), 1-based and
  // gapped after a delete. It orders every list and is never sent to a client.
  declare position: number;
  // countWords(text), written by the text setter in initChapterModel whenever
  // text is assigned. Summed into BookDetail.wordCount; never sent per chapter.
  declare wordCount: CreationOptional<number>;
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
        // A setter rather than a hook: bulkCreate (the seed) runs setters as it
        // builds each row but skips per-instance hooks, and instance.update
        // writes a setter's side effect as a changed field. Rows read back
        // from MySQL are built raw, so a read never recounts.
        set(this: Chapter, value: string) {
          this.setDataValue('text', value);
          this.setDataValue('wordCount', countWords(value));
        },
      },
      // See User.ts: declaring the timestamps ourselves opts out of Sequelize's
      // implicit NOT NULL, so it is restated here.
      // Millisecond precision, like updatedAt below: a chapter scheduled for
      // 18:00:00.500 is not out at 18:00:00.
      publishedAt: { type: DataTypes.DATE(3), allowNull: true },
      // No default: chapterRepository.create appends, and a row inserted any
      // other way should fail loudly rather than land at an arbitrary place.
      position: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      // No default: the text setter always supplies it, and a row inserted any
      // other way should fail loudly rather than claim zero words.
      wordCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
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
        // `ORDER BY position, id` — InnoDB appends the primary key to every
        // secondary index, so the id tie-break is covered too — and neither
        // needs a filesort. It is also a leftmost prefix of the foreign key's
        // column, so InnoDB reuses it instead of creating a second index for
        // the constraint. Not unique: a reorder rewrites every position in one
        // UPDATE, and a unique index would refuse the rows it passes through.
        { name: 'chapters_book_id_position', fields: ['bookId', 'position'] },
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
