import { ForeignKeyConstraintError, Op } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { Book } from '../models/Book.ts';
import { BookAuthor } from '../models/BookAuthor.ts';
import {
  Chapter,
  toChapterSummary,
  toPublicChapter,
} from '../models/Chapter.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  ChapterSummary,
  CreateChapterInput,
  ListChaptersQuery,
  PublicChapter,
  UpdateChapterInput,
} from '../types/chapter.ts';
import { containsPattern } from './likePattern.ts';
import { readableBookInclude, type Viewer } from './visibility.ts';

export interface ChapterListResult {
  // Summaries, not full records: see list() for why the body stays out of the
  // SELECT.
  items: ChapterSummary[];
  total: number;
}

export interface ChapterRepository {
  create(input: CreateChapterInput): Promise<PublicChapter>;
  // Both leave out the chapters of a Draft book the viewer may not read — a
  // hidden chapter is reported exactly as a missing one.
  list(query: ListChaptersQuery, viewer: Viewer): Promise<ChapterListResult>;
  findById(id: number, viewer: Viewer): Promise<PublicChapter | null>;
  update(id: number, input: UpdateChapterInput): Promise<PublicChapter | null>;
  remove(id: number): Promise<boolean>;
  // Two lookups, not one: a create is checked against the *target book* before
  // the chapter exists, while an update or delete is checked against the
  // chapter that is already there.
  //
  // Both answer with the book's Co-author ids, or null when the chapter (or the
  // book) is not there.
  findCoAuthorIds(id: number): Promise<number[] | null>;
  findBookCoAuthorIds(bookId: number): Promise<number[] | null>;
}

// A rejected FK on `chapters.bookId` means the referenced book does not exist.
// Reporting that as a 404 on the book is more useful than the generic 500 an
// unmapped SequelizeForeignKeyConstraintError would produce.
//
// Simpler than bookRepository's equivalent, which has to read MySQL's
// constraint text to tell two foreign keys apart: chapters carry exactly one,
// so there is only ever one row to blame.
function asMissingBook(error: unknown, bookId: number): never {
  if (error instanceof ForeignKeyConstraintError) {
    throw new NotFoundError('Book', bookId);
  }
  throw error;
}

function buildWhere(query: ListChaptersQuery): WhereOptions {
  const clauses: WhereOptions[] = [];

  if (query.bookId !== undefined) {
    clauses.push({ bookId: query.bookId });
  }

  if (query.q) {
    // Searches the title as well as the body, so `?q=` finds a chapter by its
    // name. Both sides are a leading-wildcard LIKE and therefore a full scan —
    // unavoidable for substring search, and the same cost the books' `?q=`
    // already pays over its description.
    const pattern = containsPattern(query.q);
    clauses.push({
      [Op.or]: [
        { title: { [Op.like]: pattern } },
        { text: { [Op.like]: pattern } },
      ],
    });
  }

  return clauses.length > 0 ? { [Op.and]: clauses } : {};
}

async function findBookCoAuthorIds(bookId: number): Promise<number[] | null> {
  const book = await Book.findByPk(bookId, { attributes: ['id'] });
  if (!book) return null;

  const credits = await BookAuthor.findAll({
    where: { bookId },
    attributes: ['userId'],
  });
  return credits.map((credit) => credit.userId);
}

export function createSequelizeChapterRepository(): ChapterRepository {
  return {
    async create(input) {
      try {
        const chapter = await Chapter.create(input);
        return toPublicChapter(chapter);
      } catch (error) {
        asMissingBook(error, input.bookId);
      }
    },

    async list(query, viewer) {
      const { rows, count } = await Chapter.findAndCountAll({
        // The body is left out of the SELECT rather than trimmed afterwards: a
        // page of twenty chapters would otherwise drag twenty MEDIUMTEXT
        // columns off disk and across the wire to be discarded.
        attributes: ['id', 'bookId', 'title', 'createdAt', 'updatedAt'],
        where: buildWhere(query),
        include: [await readableBookInclude(viewer)],
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'ASC']],
      });

      return { items: rows.map(toChapterSummary), total: count };
    },

    async findById(id, viewer) {
      const chapter = await Chapter.findOne({
        where: { id },
        include: [await readableBookInclude(viewer)],
      });
      return chapter ? toPublicChapter(chapter) : null;
    },

    async update(id, input) {
      const chapter = await Chapter.findByPk(id);
      if (!chapter) return null;

      // No FK mapping here, unlike books: bookId is absent from
      // updateChapterSchema, so an update cannot violate the constraint.
      await chapter.update(input);
      return toPublicChapter(chapter);
    },

    async remove(id) {
      const deleted = await Chapter.destroy({ where: { id } });
      return deleted > 0;
    },

    async findCoAuthorIds(id) {
      const chapter = await Chapter.findByPk(id, { attributes: ['bookId'] });
      return chapter ? findBookCoAuthorIds(chapter.bookId) : null;
    },

    findBookCoAuthorIds,
  };
}
