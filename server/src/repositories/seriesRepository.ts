import {
  col,
  ForeignKeyConstraintError,
  fn,
  literal,
  Op,
  where as sequelizeWhere,
} from 'sequelize';
import type { Sequelize, Transaction, Utils, WhereOptions } from 'sequelize';
import { Book } from '../models/Book.ts';
import { Favorite } from '../models/Favorite.ts';
import { Series, toPublicSeries } from '../models/Series.ts';
import { SeriesAuthor } from '../models/SeriesAuthor.ts';
import { SeriesCover } from '../models/SeriesCover.ts';
import { User } from '../models/User.ts';
import {
  addCoAuthor,
  asMissingUser,
  creditedIds,
  loadAuthors,
  removeCoAuthor,
  type CreditTable,
} from './coAuthors.ts';
import {
  assertGenreExists,
  genreFamilyIds,
  genreOf,
  loadGenres,
} from './genreRepository.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  BookSort,
  ListResponse,
  PublicSeries,
  SeriesDetail,
} from 'shared';
import type {
  CreateSeriesInput,
  ListSeriesQuery,
  UpdateSeriesInput,
} from '../types/series.ts';
import { containsPattern } from './likePattern.ts';
import { deleterOf, notify, type Actor } from './notificationRepository.ts';
import {
  publishedSeriesWhere,
  visibleSeriesWhere,
  type Viewer,
} from './visibility.ts';

export type SeriesListResult = Pick<
  ListResponse<PublicSeries>,
  'items' | 'total'
>;

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
  // What GET /api/series/:id serves: findById plus the Favorite state. null
  // where findById is.
  findDetailById(id: number, viewer: Viewer): Promise<SeriesDetail | null>;
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
  // The Cover's bytes never ride along with any other read: these three are
  // the only place series_covers is touched. false/null mean "no such series",
  // removeCover included, so a caller can tell that from "no Cover to remove",
  // which is a silent no-op. getCoverData also answers null for a series the
  // viewer may not see.
  setCover(seriesId: number, data: Buffer): Promise<boolean>;
  removeCover(seriesId: number): Promise<boolean>;
  getCoverData(
    seriesId: number,
    viewer: Viewer
  ): Promise<{ data: Buffer; updatedAt: Date } | null>;
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

// Every Cover's URL for the series named, in one query, as a Book's.
async function loadCoverUrls(
  seriesIds: number[],
  transaction?: Transaction
): Promise<Map<number, string>> {
  if (seriesIds.length === 0) return new Map();

  const covers = await SeriesCover.findAll({
    where: { seriesId: seriesIds },
    attributes: ['seriesId', 'updatedAt'],
    transaction,
  });
  return new Map(
    covers.map((cover) => [
      cover.seriesId,
      `/api/series/${cover.seriesId}/cover?v=${cover.updatedAt.getTime()}`,
    ])
  );
}

// Published Books per series, in one grouped query. Drafts are left out so a
// reader's count never reveals one.
async function loadBookCounts(
  seriesIds: number[],
  transaction?: Transaction
): Promise<Map<number, number>> {
  if (seriesIds.length === 0) return new Map();

  const rows = await Book.findAll({
    where: { seriesId: seriesIds, status: { [Op.ne]: 'draft' } },
    attributes: ['seriesId', [fn('COUNT', col('id')), 'count']],
    group: ['seriesId'],
    raw: true,
    transaction,
  });
  return new Map(
    rows.flatMap((row) => {
      const { seriesId, count } = row as unknown as {
        seriesId: number;
        count: number | string;
      };
      return [[seriesId, Number(count)]];
    })
  );
}

async function withAuthors(
  series: Series,
  transaction?: Transaction
): Promise<PublicSeries> {
  const [authors, genres, coverUrls, bookCounts] = await Promise.all([
    loadAuthors(credits, [series.id], transaction),
    loadGenres([series.genreId], transaction),
    loadCoverUrls([series.id], transaction),
    loadBookCounts([series.id], transaction),
  ]);
  return toPublicSeries(
    series,
    authors.get(series.id) ?? [],
    genreOf(series.genreId, genres),
    coverUrls.get(series.id) ?? null,
    bookCounts.get(series.id) ?? 0
  );
}

// A page of rows as PublicSeries, in the order given, with credits and Genres
// in one query each. Exported for favoriteRepository, whose rows embed the
// series they point at.
export async function publicSeriesOf(rows: Series[]): Promise<PublicSeries[]> {
  const ids = rows.map((row) => row.id);
  const [authors, genres, coverUrls, bookCounts] = await Promise.all([
    loadAuthors(credits, ids),
    loadGenres(rows.map((row) => row.genreId)),
    loadCoverUrls(ids),
    loadBookCounts(ids),
  ]);
  return rows.map((row) =>
    toPublicSeries(
      row,
      authors.get(row.id) ?? [],
      genreOf(row.genreId, genres),
      coverUrls.get(row.id) ?? null,
      bookCounts.get(row.id) ?? 0
    )
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

async function favoritesOf(viewer: Viewer): Promise<Map<number, number>> {
  if (viewer === null) return new Map();
  const rows = await Favorite.findAll({
    where: { userId: viewer.id, seriesId: { [Op.ne]: null } },
    attributes: ['id', 'seriesId'],
  });
  return new Map(
    rows.flatMap((row) =>
      row.seriesId === null ? [] : [[row.seriesId, row.id]]
    )
  );
}

// What `?sort=` ranks a series row by: the Book sorts over its non-Draft Books,
// as correlated subqueries (NULL for a series with no Published Chapter, 0 Likes
// for `popular`). Chapters count once their Publication time has passed, as
// bookRepository's publicationEdge judges them; the escaped Date is the only
// value spliced in.
function seriesRankOf(sort: BookSort): Utils.Literal {
  if (sort === 'popular') {
    return literal(
      "(SELECT COUNT(*) FROM `likes` JOIN `books` ON `books`.`id` = `likes`.`bookId` WHERE `books`.`seriesId` = `Series`.`id` AND `books`.`status` <> 'draft' AND `likes`.`isLike` = true)"
    );
  }
  const now = sequelizeOf().escape(new Date());
  return literal(
    `(SELECT ${sort === 'new' ? 'MIN' : 'MAX'}(\`chapters\`.\`publishedAt\`) FROM \`chapters\` JOIN \`books\` ON \`books\`.\`id\` = \`chapters\`.\`bookId\` WHERE \`books\`.\`seriesId\` = \`Series\`.\`id\` AND \`books\`.\`status\` <> 'draft' AND \`chapters\`.\`publishedAt\` <= ${now})`
  );
}

// creditedSeriesIds is the series `?userId=` names, looked up beforehand so the
// LIMIT keeps paging over series rather than credit rows.
function buildWhere(
  query: ListSeriesQuery,
  creditedSeriesIds: number[] | undefined,
  genreIds: number[] | undefined,
  favorites: Map<number, number> | undefined
): WhereOptions {
  const clauses: WhereOptions[] = [];

  if (creditedSeriesIds !== undefined) {
    // An empty list becomes `IN (NULL)`, which matches nothing, as it should.
    clauses.push({ id: creditedSeriesIds });
  }

  if (favorites !== undefined) {
    clauses.push({ id: [...favorites.keys()] });
  }

  // genreIds is the Genre `?genreId=` names plus its Subgenres, looked up
  // beforehand. ANDed with the other filters. An empty list (an id that names
  // no Genre) matches nothing, as an unknown `?tag=` does.
  if (genreIds !== undefined) {
    clauses.push({ genreId: genreIds });
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

      const genreIds =
        query.genreId === undefined
          ? undefined
          : await genreFamilyIds(query.genreId);

      const favorites =
        query.favoritedBy === undefined ? undefined : await favoritesOf(viewer);

      const { rows, count } = await Series.findAndCountAll({
        where: {
          [Op.and]: [
            buildWhere(query, creditedSeriesIds, genreIds, favorites),
            query.published
              ? publishedSeriesWhere()
              : await visibleSeriesWhere(viewer),
          ],
        },
        limit: query.limit,
        offset: query.offset,
        order: query.sort
          ? [
              [seriesRankOf(query.sort), 'DESC'],
              ['id', 'DESC'],
            ]
          : [['id', 'ASC']],
      });

      const items = await publicSeriesOf(rows);
      return {
        items:
          favorites === undefined
            ? items
            : items.map((item) => ({
                ...item,
                favoriteId: favorites.get(item.id),
              })),
        total: count,
      };
    },

    async findById(id, viewer) {
      const series = await Series.findOne({
        where: { [Op.and]: [{ id }, await visibleSeriesWhere(viewer)] },
      });
      return series ? withAuthors(series) : null;
    },

    async findDetailById(id, viewer) {
      const series = await Series.findOne({
        where: { [Op.and]: [{ id }, await visibleSeriesWhere(viewer)] },
      });
      if (!series) return null;

      const viewerId = viewer?.id ?? null;
      const [withCredits, favoriteCount, viewerFavorite] = await Promise.all([
        withAuthors(series),
        Favorite.count({ where: { seriesId: id } }),
        viewerId === null
          ? null
          : Favorite.findOne({
              where: { seriesId: id, userId: viewerId },
              attributes: ['id'],
            }),
      ]);

      return {
        ...withCredits,
        favoriteCount,
        viewerFavoriteId: viewerFavorite?.id ?? null,
      };
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

    async setCover(seriesId, data) {
      // The cover row's foreign key is the existence check, so a series deleted
      // mid-upload reads as not found (as commentRepository maps it).
      try {
        await SeriesCover.upsert({ seriesId, data });
        return true;
      } catch (error) {
        if (error instanceof ForeignKeyConstraintError) return false;
        throw error;
      }
    },

    async removeCover(seriesId) {
      const series = await Series.findByPk(seriesId, { attributes: ['id'] });
      if (!series) return false;
      await SeriesCover.destroy({ where: { seriesId } });
      return true;
    },

    async getCoverData(seriesId, viewer) {
      const series = await Series.findOne({
        where: {
          [Op.and]: [{ id: seriesId }, await visibleSeriesWhere(viewer)],
        },
        attributes: ['id'],
      });
      if (!series) return null;

      const cover = await SeriesCover.findByPk(seriesId, {
        attributes: ['data', 'updatedAt'],
      });
      return cover ? { data: cover.data, updatedAt: cover.updatedAt } : null;
    },
  };
}
