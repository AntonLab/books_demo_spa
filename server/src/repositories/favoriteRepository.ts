import {
  ForeignKeyConstraintError,
  Op,
  UniqueConstraintError,
} from 'sequelize';
import { Book } from '../models/Book.ts';
import { Favorite, toPublicFavorite } from '../models/Favorite.ts';
import { Series } from '../models/Series.ts';
import { ConflictError, NotFoundError } from '../types/errors.ts';
import type {
  FavoriteBook,
  FavoriteSeries,
  ListResponse,
  PublicFavorite,
} from 'shared';
import type {
  CreateFavoriteInput,
  ListFavoritesQuery,
} from '../types/favorite.ts';
import { publicBooksOf } from './bookRepository.ts';
import { publicSeriesOf } from './seriesRepository.ts';
import {
  readableBookWhere,
  visibleSeriesWhere,
  type Viewer,
} from './visibility.ts';

// The signed-in account a Favorite belongs to. Never a Guest: every route
// that reaches this repository is guarded.
export type Account = NonNullable<Viewer>;

export type FavoriteBookListResult = Pick<
  ListResponse<FavoriteBook>,
  'items' | 'total'
>;
export type FavoriteSeriesListResult = Pick<
  ListResponse<FavoriteSeries>,
  'items' | 'total'
>;

export interface FavoriteRepository {
  // The account is separate from the input, so the type says the holder is
  // not caller-supplied data. A work the account may not see is the same
  // NotFoundError as a missing one.
  create(input: CreateFavoriteInput, account: Account): Promise<PublicFavorite>;
  // Scoped to the holder: another account's id answers false, exactly like a
  // missing one, so a refusal never reveals the id exists.
  remove(id: number, accountId: number): Promise<boolean>;
  // Newest first. A Draft book is left out of both items and total, however
  // the account relates to it; the row itself is kept.
  listBooks(
    query: ListFavoritesQuery,
    account: Account
  ): Promise<FavoriteBookListResult>;
  // Newest first. A series the account may no longer see is left out.
  listSeries(
    query: ListFavoritesQuery,
    account: Account
  ): Promise<FavoriteSeriesListResult>;
}

// A work the account may not see answers exactly as a missing one, so a
// refusal never reveals that a Draft exists. Safe as a check before the insert:
// the race it leaves — a work turning Draft in between — at worst stores a
// Favorite the lists already hide.
async function assertVisibleTarget(
  input: CreateFavoriteInput,
  account: Account
): Promise<void> {
  if (input.bookId !== null) {
    const book = await Book.findOne({
      where: {
        [Op.and]: [{ id: input.bookId }, await readableBookWhere(account)],
      },
      attributes: ['id'],
    });
    if (!book) throw new NotFoundError('Book', input.bookId);
  }
  if (input.seriesId !== null) {
    const series = await Series.findOne({
      where: {
        [Op.and]: [{ id: input.seriesId }, await visibleSeriesWhere(account)],
      },
      attributes: ['id'],
    });
    if (!series) throw new NotFoundError('Series', input.seriesId);
  }
}

// A rejected foreign key means the row went away after the check above, or
// the account did. MySQL names the column in the constraint text, the only
// place the three are distinguishable; userId is the fallback, being the one
// key every row carries.
function asMissingReference(
  error: unknown,
  input: CreateFavoriteInput,
  accountId: number
): never {
  if (error instanceof ForeignKeyConstraintError) {
    const detail = `${error.index ?? ''} ${error.parent?.message ?? error.message}`;
    if (input.bookId !== null && detail.includes('bookId')) {
      throw new NotFoundError('Book', input.bookId);
    }
    if (input.seriesId !== null && detail.includes('seriesId')) {
      throw new NotFoundError('Series', input.seriesId);
    }
    throw new NotFoundError('User', accountId);
  }
  throw error;
}

// An `include` marked required always carries its row; the association's
// type cannot say so.
function joined<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('A required include came back without its row');
  }
  return value;
}

export function createSequelizeFavoriteRepository(): FavoriteRepository {
  return {
    async create(input, account) {
      await assertVisibleTarget(input, account);

      try {
        const favorite = await Favorite.create({
          ...input,
          userId: account.id,
        });
        return toPublicFavorite(favorite);
      } catch (error) {
        // One favorite per account per work comes from the unique indexes,
        // never a findOne first.
        if (error instanceof UniqueConstraintError) {
          throw new ConflictError('favorite');
        }
        asMissingReference(error, input, account.id);
      }
    },

    async remove(id, accountId) {
      const deleted = await Favorite.destroy({
        where: { id, userId: accountId },
      });
      return deleted > 0;
    },

    async listBooks(query, account) {
      // The status filter sits on the join, so a Draft book leaves `total`
      // too — for everyone, its Co-authors and Moderators included.
      const { rows, count } = await Favorite.findAndCountAll({
        where: { userId: account.id },
        include: [
          {
            model: Book,
            as: 'book',
            required: true,
            where: { status: { [Op.ne]: 'draft' } },
          },
        ],
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'DESC']],
      });

      const books = await publicBooksOf(rows.map((row) => joined(row.book)));
      return {
        items: rows.map((row, index) => ({
          id: row.id,
          createdAt: row.createdAt,
          book: joined(books[index]),
        })),
        total: count,
      };
    },

    async listSeries(query, account) {
      const { rows, count } = await Favorite.findAndCountAll({
        where: { userId: account.id },
        include: [
          {
            model: Series,
            as: 'series',
            required: true,
            where: await visibleSeriesWhere(account),
          },
        ],
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'DESC']],
      });

      const series = await publicSeriesOf(
        rows.map((row) => joined(row.series))
      );
      return {
        items: rows.map((row, index) => ({
          id: row.id,
          createdAt: row.createdAt,
          series: joined(series[index]),
        })),
        total: count,
      };
    },
  };
}
