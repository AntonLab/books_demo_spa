import { col, fn, Op, where as sequelizeWhere } from 'sequelize';
import type { Sequelize, Transaction, WhereOptions } from 'sequelize';
import { Book } from '../models/Book.ts';
import { Series, toPublicSeries } from '../models/Series.ts';
import { SeriesAuthor } from '../models/SeriesAuthor.ts';
import { User } from '../models/User.ts';
import {
  addCoAuthor,
  asMissingUser,
  creditedIds,
  loadAuthors,
  removeCoAuthor,
  type CreditTable,
} from './coAuthors.ts';
import { assertGenreExists, genreOf, loadGenres } from './genreRepository.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  CreateSeriesInput,
  ListSeriesQuery,
  PublicSeries,
  UpdateSeriesInput,
} from '../types/series.ts';
import { containsPattern } from './likePattern.ts';
import { deleterOf, notify, type Actor } from './notificationRepository.ts';
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
  // Like a book's, the writes that change who is credited or end the series
  // take the actor and tell the other Co-authors in the same transaction.
  remove(id: number, actor: Actor): Promise<boolean>;
  // null when the series is not there, as update/remove report it.
  addCoAuthor(
    seriesId: number,
    userId: number,
    actor: Actor
  ): Promise<PublicSeries | null>;
  // Takes a book out of the series from the series' side. false when the
  // series is not there; a NotFoundError on the book when it is not in this
  // series, so a caller cannot unlink a book filed somewhere else.
  removeBook(seriesId: number, bookId: number): Promise<boolean>;
  // Covers both removing someone else and leaving, as on a book.
  removeCoAuthor(
    seriesId: number,
    userId: number,
    actor: Actor
  ): Promise<PublicSeries | null>;
  // The cheapest question the ownership check can ask: one indexed lookup, no
  // eager loads, no serialisation. null when the series is not there.
  findCoAuthorIds(id: number): Promise<number[] | null>;
}

function sequelizeOf(): Sequelize {
  const sequelize = Series.sequelize;
  if (!sequelize) throw new Error('Series model is not initialised');
  return sequelize;
}

const credits: CreditTable = {
  type: 'series',
  find: async (seriesIds, { withUser = false, transaction }) =>
    (
      await SeriesAuthor.findAll({
        where: { seriesId: seriesIds },
        include: withUser ? [{ model: User, as: 'user' }] : [],
        order: [['id', 'ASC']],
        transaction,
      })
    ).map(({ seriesId, userId, user }) => ({ workId: seriesId, userId, user })),
  create: (seriesId, userId, transaction) =>
    SeriesAuthor.create({ seriesId, userId }, { transaction }),
  destroy: (seriesId, userId, transaction) =>
    SeriesAuthor.destroy({ where: { seriesId, userId }, transaction }),
};

async function withAuthors(
  series: Series,
  transaction?: Transaction
): Promise<PublicSeries> {
  const [authors, genres] = await Promise.all([
    loadAuthors(credits, [series.id], transaction),
    loadGenres([series.genreId], transaction),
  ]);
  return toPublicSeries(
    series,
    authors.get(series.id) ?? [],
    genreOf(series.genreId, genres)
  );
}

// Exported for bookRepository, which asks the same question about the series a
// book is being filed under.
export async function findSeriesCoAuthorIds(
  seriesId: number
): Promise<number[] | null> {
  const series = await Series.findByPk(seriesId, { attributes: ['id'] });
  return series ? creditedIds(credits, seriesId) : null;
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

  // A5: ANDed with the other filters. An id that names no Genre matches
  // nothing and yields an empty list, as an unknown `?tag=` does.
  if (query.genreId !== undefined) {
    clauses.push({ genreId: query.genreId });
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
          await assertGenreExists(attributes.genreId, transaction);
          const series = await Series.create(attributes, { transaction });
          await credits.create(series.id, userId, transaction);
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

      const [authors, genres] = await Promise.all([
        loadAuthors(
          credits,
          rows.map((row) => row.id)
        ),
        loadGenres(rows.map((row) => row.genreId)),
      ]);
      return {
        items: rows.map((row) =>
          toPublicSeries(
            row,
            authors.get(row.id) ?? [],
            genreOf(row.genreId, genres)
          )
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
      return sequelizeOf().transaction(async (transaction) => {
        const series = await Series.findByPk(id, { transaction });
        if (!series) return null;

        await assertGenreExists(input.genreId, transaction);
        await series.update(input, { transaction });
        return withAuthors(series, transaction);
      });
    },

    async remove(id, actor) {
      return sequelizeOf().transaction(async (transaction) => {
        const series = await Series.findByPk(id, {
          attributes: ['id', 'title'],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!series) return false;

        const coAuthorIds = await creditedIds(credits, id, transaction);
        await notify(
          [
            {
              recipientIds: coAuthorIds,
              kind: 'work_deleted',
              work: { type: 'series', id: null, title: series.title },
              ...(await deleterOf(actor, coAuthorIds, transaction)),
            },
          ],
          actor.id,
          transaction
        );

        // The foreign key unlinks the books; their place in the series goes
        // with it here, so no book outside a series keeps a position.
        await Book.update(
          { seriesPosition: null },
          { where: { seriesId: id }, transaction, silent: true }
        );
        const deleted = await Series.destroy({ where: { id }, transaction });
        return deleted > 0;
      });
    },

    async addCoAuthor(seriesId, userId, actor) {
      const series = await Series.findByPk(seriesId);
      if (!series) return null;

      await addCoAuthor(credits, sequelizeOf(), series, userId, actor);
      return withAuthors(series);
    },

    async removeBook(seriesId, bookId) {
      const series = await Series.findByPk(seriesId, { attributes: ['id'] });
      if (!series) return false;

      // The series id is part of the WHERE, so a book filed elsewhere matches
      // nothing and is reported missing rather than silently unlinked.
      const [unlinked] = await Book.update(
        { seriesId: null, seriesPosition: null },
        { where: { id: bookId, seriesId } }
      );
      if (unlinked === 0) throw new NotFoundError('Book', bookId);
      return true;
    },

    // Under a lock on the series row, which removeCoAuthor (coAuthors.ts)
    // relies on.
    async removeCoAuthor(seriesId, userId, actor) {
      return sequelizeOf().transaction(async (transaction) => {
        const series = await Series.findByPk(seriesId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!series) return null;

        await removeCoAuthor(credits, series, userId, actor, transaction);
        return withAuthors(series, transaction);
      });
    },

    async findCoAuthorIds(id) {
      return findSeriesCoAuthorIds(id);
    },
  };
}
