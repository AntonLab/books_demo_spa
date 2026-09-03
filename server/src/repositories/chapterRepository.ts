import { ForeignKeyConstraintError, Op } from 'sequelize';
import type { WhereOptions } from 'sequelize';
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

export interface ChapterListResult {
  // Summaries, not full records: see list() for why the body stays out of the
  // SELECT.
  items: ChapterSummary[];
  total: number;
}

export interface ChapterRepository {
  create(input: CreateChapterInput): Promise<PublicChapter>;
  list(query: ListChaptersQuery): Promise<ChapterListResult>;
  findById(id: number): Promise<PublicChapter | null>;
  update(id: number, input: UpdateChapterInput): Promise<PublicChapter | null>;
  remove(id: number): Promise<boolean>;
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

    async list(query) {
      const { rows, count } = await Chapter.findAndCountAll({
        // The body is left out of the SELECT rather than trimmed afterwards: a
        // page of twenty chapters would otherwise drag twenty MEDIUMTEXT
        // columns off disk and across the wire to be discarded.
        attributes: ['id', 'bookId', 'title', 'createdAt', 'updatedAt'],
        where: buildWhere(query),
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'ASC']],
      });

      return { items: rows.map(toChapterSummary), total: count };
    },

    async findById(id) {
      const chapter = await Chapter.findByPk(id);
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
  };
}
