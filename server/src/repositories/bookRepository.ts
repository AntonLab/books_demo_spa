import {
  col,
  fn,
  ForeignKeyConstraintError,
  Op,
  where as sequelizeWhere,
} from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { Book, toPublicBook } from '../models/Book.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  CreateBookInput,
  ListBooksQuery,
  PublicBook,
  UpdateBookInput,
} from '../types/book.ts';
import { containsPattern } from './likePattern.ts';

export interface BookListResult {
  items: PublicBook[];
  total: number;
}

export interface BookRepository {
  create(input: CreateBookInput): Promise<PublicBook>;
  list(query: ListBooksQuery): Promise<BookListResult>;
  findById(id: number): Promise<PublicBook | null>;
  update(id: number, input: UpdateBookInput): Promise<PublicBook | null>;
  remove(id: number): Promise<boolean>;
}

// A rejected FK on `books` means the referenced row does not exist. Reporting
// that as a 404 is more useful than the generic 500 an unmapped
// SequelizeForeignKeyConstraintError would produce.
//
// Unlike series, books carry two foreign keys, so the error has to say which
// one failed — a "User not found" for a bad seriesId would send the caller
// hunting for a user that is sitting right there. MySQL names the offending
// column in the constraint text, which is the only place the two are
// distinguishable; seriesId can only be at fault when one was supplied, so
// userId is the safe fallback.
function asMissingReference(
  error: unknown,
  userId: number | undefined,
  seriesId: number | null | undefined
): never {
  if (error instanceof ForeignKeyConstraintError) {
    const detail = `${error.index ?? ''} ${error.parent?.message ?? error.message}`;

    if (
      seriesId !== null &&
      seriesId !== undefined &&
      detail.includes('seriesId')
    ) {
      throw new NotFoundError('Series', seriesId);
    }
    if (userId !== undefined) {
      throw new NotFoundError('User', userId);
    }
  }
  throw error;
}

function buildWhere(query: ListBooksQuery): WhereOptions {
  const clauses: WhereOptions[] = [];

  if (query.userId !== undefined) {
    clauses.push({ userId: query.userId });
  }

  if (query.seriesId !== undefined) {
    clauses.push({ seriesId: query.seriesId });
  }

  if (query.tag) {
    // MySQL cannot index into a plain JSON array with `=`, so membership goes
    // through JSON_CONTAINS. The tag is passed as an argument to fn(), which
    // Sequelize escapes as a literal — it is never concatenated into the SQL.
    clauses.push(
      sequelizeWhere(
        fn('JSON_CONTAINS', col('tags'), JSON.stringify(query.tag)),
        Op.eq,
        1
      )
    );
  }

  if (query.q) {
    clauses.push({ description: { [Op.like]: containsPattern(query.q) } });
  }

  return clauses.length > 0 ? { [Op.and]: clauses } : {};
}

export function createSequelizeBookRepository(): BookRepository {
  return {
    async create(input) {
      try {
        const book = await Book.create(input);
        return toPublicBook(book);
      } catch (error) {
        asMissingReference(error, input.userId, input.seriesId);
      }
    },

    async list(query) {
      const { rows, count } = await Book.findAndCountAll({
        where: buildWhere(query),
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'ASC']],
      });

      return { items: rows.map(toPublicBook), total: count };
    },

    async findById(id) {
      const book = await Book.findByPk(id);
      return book ? toPublicBook(book) : null;
    },

    async update(id, input) {
      const book = await Book.findByPk(id);
      if (!book) return null;

      try {
        // `update` writes only the keys present, so an omitted seriesId leaves
        // the link alone while an explicit null clears it.
        await book.update(input);
      } catch (error) {
        asMissingReference(error, undefined, input.seriesId);
      }
      return toPublicBook(book);
    },

    async remove(id) {
      const deleted = await Book.destroy({ where: { id } });
      return deleted > 0;
    },
  };
}
