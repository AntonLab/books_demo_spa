import { UniqueConstraintError } from 'sequelize';
import type { Transaction } from 'sequelize';
import { Genre, toPublicGenre } from '../models/Genre.ts';
import { BadRequestError, ConflictError } from '../types/errors.ts';
import type { GenreInput, PublicGenre } from '../types/genre.ts';

export interface GenreRepository {
  // Every Genre, alphabetically. No paging envelope, unlike the books and
  // series lists: the list is short, the header shows it whole, and A1 says so.
  list(): Promise<PublicGenre[]>;
  create(input: GenreInput): Promise<PublicGenre>;
  // null when no Genre has that id, the way every other repository reports a
  // missing row.
  update(id: number, input: GenreInput): Promise<PublicGenre | null>;
  remove(id: number): Promise<boolean>;
}

// The unique index on `genres.name` is the only constraint here, so there is
// nothing to disambiguate: a violation is always the name (M1).
function asConflict(error: unknown): never {
  if (error instanceof UniqueConstraintError) {
    throw new ConflictError('name');
  }
  throw error;
}

// Both the real repository and the fakes answer a genreId that names no Genre
// with this exact error, so a contract case can assert the message once (A6).
export function missingGenre(genreId: number): BadRequestError {
  return new BadRequestError(`Genre ${genreId} does not exist`);
}

// A6: a genreId the caller chose that names no Genre is a 400, not a 404 — the
// missing row is a field of the request, not the resource it addresses, which
// is why this is a BadRequestError rather than the NotFoundError a missing
// series gets. Checked before the write, inside the caller's transaction where
// there is one, rather than left to the foreign key, whose rejection would
// surface as an unmapped 500. The foreign key stays the backstop.
export async function assertGenreExists(
  genreId: number | null | undefined,
  transaction?: Transaction
): Promise<void> {
  if (genreId === null || genreId === undefined) return;

  const genre = await Genre.findByPk(genreId, {
    attributes: ['id'],
    transaction,
  });
  if (!genre) throw missingGenre(genreId);
}

// Every Genre named, by id, in one query — the batching loadAuthors and
// loadCoverUrls use, and for the same reason: a page's LIMIT must stay over
// books or series, never over a joined table. Nulls and duplicates in the
// input are filtered out here, so a caller can hand over a column straight
// off a page of rows.
export async function loadGenres(
  genreIds: readonly (number | null | undefined)[],
  transaction?: Transaction
): Promise<Map<number, PublicGenre>> {
  const ids = [
    ...new Set(genreIds.filter((id): id is number => typeof id === 'number')),
  ];
  if (ids.length === 0) return new Map();

  const genres = await Genre.findAll({ where: { id: ids }, transaction });
  return new Map(genres.map((genre) => [genre.id, toPublicGenre(genre)]));
}

// The Genre a row carries, read out of a map loadGenres filled. null for a row
// with no Genre, and — defensively — for one whose Genre was not in the batch.
export function genreOf(
  genreId: number | null | undefined,
  genres: ReadonlyMap<number, PublicGenre>
): PublicGenre | null {
  if (genreId === null || genreId === undefined) return null;
  return genres.get(genreId) ?? null;
}

export function createSequelizeGenreRepository(): GenreRepository {
  return {
    async list() {
      // ORDER BY name under the column's utf8mb4_0900_ai_ci collation, so the
      // order ignores case exactly as the uniqueness does (M1).
      const genres = await Genre.findAll({ order: [['name', 'ASC']] });
      return genres.map(toPublicGenre);
    },

    async create(input) {
      try {
        return toPublicGenre(await Genre.create(input));
      } catch (error) {
        asConflict(error);
      }
    },

    async update(id, input) {
      const genre = await Genre.findByPk(id);
      if (!genre) return null;

      try {
        await genre.update(input);
      } catch (error) {
        asConflict(error);
      }
      return toPublicGenre(genre);
    },

    async remove(id) {
      // The foreign keys do the rest: books.genreId and series.genreId are
      // ON DELETE SET NULL, so this one statement also leaves every Book and
      // Series in the Genre without one (A4, M2).
      return (await Genre.destroy({ where: { id } })) > 0;
    },
  };
}
