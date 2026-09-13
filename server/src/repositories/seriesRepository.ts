import {
  col,
  fn,
  ForeignKeyConstraintError,
  Op,
  UniqueConstraintError,
  where as sequelizeWhere,
} from 'sequelize';
import type { Sequelize, Transaction, WhereOptions } from 'sequelize';
import { Book } from '../models/Book.ts';
import { Series, toPublicSeries } from '../models/Series.ts';
import { SeriesAuthor } from '../models/SeriesAuthor.ts';
import { toAuthorSummary, User } from '../models/User.ts';
import {
  BadRequestError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import type { AuthorSummary } from '../types/user.ts';
import type {
  CreateSeriesInput,
  ListSeriesQuery,
  PublicSeries,
  UpdateSeriesInput,
} from '../types/series.ts';
import { containsPattern } from './likePattern.ts';
import { visibleSeriesWhere, type Viewer } from './visibility.ts';

export interface SeriesListResult {
  items: PublicSeries[];
  total: number;
}

export interface SeriesRepository {
  // userId is the series' first Co-author. It is not part of
  // CreateSeriesInput: it comes from the session, never the request body, so
  // it is supplied as a separate argument rather than a schema field a caller
  // could set.
  create(input: CreateSeriesInput & { userId: number }): Promise<PublicSeries>;
  // Both leave out a series the viewer may not see: one with no Published book,
  // unless the viewer co-authors it or is a Moderator.
  list(query: ListSeriesQuery, viewer: Viewer): Promise<SeriesListResult>;
  findById(id: number, viewer: Viewer): Promise<PublicSeries | null>;
  update(id: number, input: UpdateSeriesInput): Promise<PublicSeries | null>;
  remove(id: number): Promise<boolean>;
  // null when the series is not there, as update/remove report it.
  addCoAuthor(seriesId: number, userId: number): Promise<PublicSeries | null>;
  // Takes a book out of the series from the series' side. false when the
  // series is not there; a NotFoundError on the book when it is not in this
  // series, so a caller cannot unlink a book filed somewhere else.
  removeBook(seriesId: number, bookId: number): Promise<boolean>;
  // Covers both removing someone else and leaving, as on a book.
  removeCoAuthor(
    seriesId: number,
    userId: number
  ): Promise<PublicSeries | null>;
  // The cheapest question the ownership check can ask: one indexed lookup, no
  // eager loads, no serialisation. null when the series is not there.
  findCoAuthorIds(id: number): Promise<number[] | null>;
}

// A rejected FK on `series_authors.userId` — the first credit — means the
// referenced user does not exist. Reporting that as a 404 on the user is more
// useful than the generic 500 an unmapped SequelizeForeignKeyConstraintError
// would produce.
function asMissingUser(error: unknown, userId: number): never {
  if (error instanceof ForeignKeyConstraintError) {
    throw new NotFoundError('User', userId);
  }
  throw error;
}

function sequelizeOf(): Sequelize {
  const sequelize = Series.sequelize;
  if (!sequelize) throw new Error('Series model is not initialised');
  return sequelize;
}

// Every Co-author of every series named, in credit order, in one query — the
// series' copy of bookRepository's loadAuthors.
async function loadAuthors(
  seriesIds: number[],
  transaction?: Transaction
): Promise<Map<number, AuthorSummary[]>> {
  const authors = new Map<number, AuthorSummary[]>(
    seriesIds.map((id) => [id, []])
  );
  if (seriesIds.length === 0) return authors;

  const credits = await SeriesAuthor.findAll({
    where: { seriesId: seriesIds },
    include: [{ model: User, as: 'user' }],
    order: [['id', 'ASC']],
    transaction,
  });
  for (const credit of credits) {
    if (credit.user) {
      authors.get(credit.seriesId)?.push(toAuthorSummary(credit.user));
    }
  }
  return authors;
}

async function withAuthors(
  series: Series,
  transaction?: Transaction
): Promise<PublicSeries> {
  const authors = await loadAuthors([series.id], transaction);
  return toPublicSeries(series, authors.get(series.id) ?? []);
}

// Exported for bookRepository, which asks the same question about the series a
// book is being filed under.
export async function findSeriesCoAuthorIds(
  seriesId: number
): Promise<number[] | null> {
  const series = await Series.findByPk(seriesId, { attributes: ['id'] });
  if (!series) return null;

  const credits = await SeriesAuthor.findAll({
    where: { seriesId },
    attributes: ['userId'],
    order: [['id', 'ASC']],
  });
  return credits.map((credit) => credit.userId);
}

// creditedSeriesIds is the series `?userId=` names, looked up beforehand so the
// LIMIT keeps paging over series rather than credit rows.
function buildWhere(
  query: ListSeriesQuery,
  creditedSeriesIds: number[] | undefined
): WhereOptions {
  const clauses: WhereOptions[] = [];

  if (creditedSeriesIds !== undefined) {
    // An empty list becomes `IN (NULL)`, which matches nothing, as it should.
    clauses.push({ id: creditedSeriesIds });
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
    // Searches the title as well as the description, so `?q=` finds a series by
    // its name. Both sides are a leading-wildcard LIKE and therefore a full
    // scan — unavoidable for substring search, and the cost the description
    // side already paid.
    const pattern = containsPattern(query.q);
    clauses.push({
      [Op.or]: [
        { title: { [Op.like]: pattern } },
        { description: { [Op.like]: pattern } },
      ],
    });
  }

  return clauses.length > 0 ? { [Op.and]: clauses } : {};
}

export function createSequelizeSeriesRepository(): SeriesRepository {
  return {
    async create(input) {
      try {
        // One transaction, so a series never exists without its first credit.
        return await sequelizeOf().transaction(async (transaction) => {
          const { userId, ...attributes } = input;
          const series = await Series.create(attributes, { transaction });
          await SeriesAuthor.create(
            { seriesId: series.id, userId },
            { transaction }
          );
          return withAuthors(series, transaction);
        });
      } catch (error) {
        asMissingUser(error, input.userId);
      }
    },

    async list(query, viewer) {
      const creditedSeriesIds =
        query.userId === undefined
          ? undefined
          : (
              await SeriesAuthor.findAll({
                where: { userId: query.userId },
                attributes: ['seriesId'],
              })
            ).map((credit) => credit.seriesId);

      const { rows, count } = await Series.findAndCountAll({
        where: {
          [Op.and]: [
            buildWhere(query, creditedSeriesIds),
            await visibleSeriesWhere(viewer),
          ],
        },
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'ASC']],
      });

      const authors = await loadAuthors(rows.map((row) => row.id));
      return {
        items: rows.map((row) =>
          toPublicSeries(row, authors.get(row.id) ?? [])
        ),
        total: count,
      };
    },

    async findById(id, viewer) {
      const series = await Series.findOne({
        where: { [Op.and]: [{ id }, await visibleSeriesWhere(viewer)] },
      });
      return series ? withAuthors(series) : null;
    },

    async update(id, input) {
      const series = await Series.findByPk(id);
      if (!series) return null;

      await series.update(input);
      return withAuthors(series);
    },

    async remove(id) {
      const deleted = await Series.destroy({ where: { id } });
      return deleted > 0;
    },

    async addCoAuthor(seriesId, userId) {
      const series = await Series.findByPk(seriesId);
      if (!series) return null;

      const user = await User.findByPk(userId, { attributes: ['role'] });
      if (!user) throw new NotFoundError('User', userId);
      if (user.role !== 'author') {
        throw new BadRequestError(
          'Only an account holding the author role can be a co-author'
        );
      }

      try {
        await SeriesAuthor.create({ seriesId, userId });
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          throw new StateConflictError(
            'That account is already a co-author of this series'
          );
        }
        throw error;
      }
      return withAuthors(series);
    },

    async removeBook(seriesId, bookId) {
      const series = await Series.findByPk(seriesId, { attributes: ['id'] });
      if (!series) return false;

      // The series id is part of the WHERE, so a book filed elsewhere matches
      // nothing and is reported missing rather than silently unlinked.
      const [unlinked] = await Book.update(
        { seriesId: null },
        { where: { id: bookId, seriesId } }
      );
      if (unlinked === 0) throw new NotFoundError('Book', bookId);
      return true;
    },

    // Under a lock on the series row, for the reason bookRepository's
    // removeCoAuthor gives: two co-authors leaving at once would otherwise
    // each count two and leave the series credited to nobody.
    async removeCoAuthor(seriesId, userId) {
      return sequelizeOf().transaction(async (transaction) => {
        const series = await Series.findByPk(seriesId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!series) return null;

        const credits = await SeriesAuthor.findAll({
          where: { seriesId },
          attributes: ['userId'],
          transaction,
        });
        // Not credited comes first, so a stranger on a solo series is not told
        // its real co-author cannot leave.
        if (!credits.some((credit) => credit.userId === userId)) {
          throw new NotFoundError('Co-author', userId);
        }
        if (credits.length <= 1) {
          throw new StateConflictError(
            'The last co-author cannot leave; delete the series instead'
          );
        }

        await SeriesAuthor.destroy({
          where: { seriesId, userId },
          transaction,
        });
        return withAuthors(series, transaction);
      });
    },

    async findCoAuthorIds(id) {
      return findSeriesCoAuthorIds(id);
    },
  };
}
