import {
  ForeignKeyConstraintError,
  literal,
  Op,
  UniqueConstraintError,
} from 'sequelize';
import type { Sequelize, Transaction } from 'sequelize';
import { Genre, toPublicGenre } from '../models/Genre.ts';
import {
  BadRequestError,
  ConflictError,
  StateConflictError,
  ValidationError,
} from '../types/errors.ts';
import type { AdminGenreListItem, GenreListItem, PublicGenre } from 'shared';
import type { GenreInput, GenreUpdateInput } from '../types/genre.ts';

export interface GenreRepository {
  // Every Genre, alphabetically. No paging envelope, unlike the books and
  // series lists: the list is short, and the header shows it whole.
  // `nonEmpty` keeps only Genres holding a Book in progress or complete, so a
  // Draft book never reveals its Genre.
  list(options?: { nonEmpty?: boolean }): Promise<GenreListItem[]>;
  // Every Genre with its own Books and Series, Drafts included and nothing
  // rolled up from Subgenres. The admin list.
  listWithCounts(): Promise<AdminGenreListItem[]>;
  create(input: GenreInput): Promise<PublicGenre>;
  // null when no Genre has that id, the way every other repository reports a
  // missing row.
  update(id: number, input: GenreUpdateInput): Promise<PublicGenre | null>;
  remove(id: number): Promise<boolean>;
}

const SIBLING_NAME_TAKEN = 'A genre with this name already exists here.';

// The unique index on (parent, name) is the only unique constraint here, so a
// violation is always the name among its siblings.
export function siblingNameTaken(): ConflictError {
  return new ConflictError('name', SIBLING_NAME_TAKEN);
}

function asConflict(error: unknown): never {
  if (error instanceof UniqueConstraintError) throw siblingNameTaken();
  throw error;
}

type ParentFault = 'missing' | 'notTopLevel' | 'self' | 'hasSubgenres';

const PARENT_FAULTS: Record<ParentFault, string> = {
  missing: 'Parent genre does not exist.',
  notTopLevel: 'A genre can only sit under a top-level genre.',
  self: 'A genre cannot be its own parent.',
  hasSubgenres: 'A genre with subgenres cannot move under another genre.',
};

// Shaped like the zod issues validate() raises, so the client reads a refused
// parent exactly as it reads any other field error.
export function parentError(fault: ParentFault): ValidationError {
  return new ValidationError([
    { path: ['parentId'], message: PARENT_FAULTS[fault] },
  ]);
}

export function hasSubgenres(): StateConflictError {
  return new StateConflictError(
    'This genre has subgenres. Move or delete its subgenres first.'
  );
}

function sequelizeOf(): Sequelize {
  const sequelize = Genre.sequelize;
  if (!sequelize) throw new Error('Genre model is not initialised');
  return sequelize;
}

function assertTopLevelParent(parent: Genre | null | undefined): Genre {
  if (!parent) throw parentError('missing');
  if (parent.parentId !== null) throw parentError('notTopLevel');
  return parent;
}

// Both the real repository and the fakes answer a genreId that names no Genre
// with this exact error, so a contract case can assert the message once.
export function missingGenre(genreId: number): BadRequestError {
  return new BadRequestError(`Genre ${genreId} does not exist`);
}

// A genreId the caller chose that names no Genre is a 400, not a 404 — the
// missing row is a field of the request, not the resource it addresses, which
// is why this is a BadRequestError rather than the NotFoundError a missing
// series gets. Checked before the write rather than left to the foreign key,
// whose rejection would surface as an unmapped 500. The check takes a share
// lock inside the caller's transaction, so a Genre deleted concurrently waits
// for the write to commit and then unlinks it (ON DELETE SET NULL) instead of
// tripping the foreign key in the gap.
export async function assertGenreExists(
  genreId: number | null | undefined,
  transaction: Transaction
): Promise<void> {
  if (genreId === null || genreId === undefined) return;

  const genre = await Genre.findByPk(genreId, {
    attributes: ['id'],
    transaction,
    lock: transaction.LOCK.SHARE,
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
  const parentIds = [
    ...new Set(
      genres.flatMap((genre) =>
        genre.parentId === null ? [] : [genre.parentId]
      )
    ),
  ];
  const parents =
    parentIds.length === 0
      ? []
      : await Genre.findAll({
          where: { id: parentIds },
          attributes: ['id', 'name'],
          transaction,
        });
  const parentById = new Map(parents.map((parent) => [parent.id, parent]));
  return new Map(
    genres.map((genre) => [
      genre.id,
      toPublicGenre(
        genre,
        genre.parentId === null
          ? null
          : (parentById.get(genre.parentId) ?? null)
      ),
    ])
  );
}

// A Genre's id plus every Subgenre's: what a search by that Genre matches. A
// Subgenre has no children, so it answers only itself; an unknown id, nothing.
export async function genreFamilyIds(genreId: number): Promise<number[]> {
  const family = await Genre.findAll({
    attributes: ['id'],
    where: { [Op.or]: [{ id: genreId }, { parentId: genreId }] },
  });
  return family.map((genre) => genre.id);
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

const NON_EMPTY_IDS =
  "(SELECT DISTINCT `genreId` FROM `books` WHERE `status` <> 'draft' AND `genreId` IS NOT NULL)";

// `table` is a fixed literal at both call sites, never caller input.
const ownRowCount = (table: 'books' | 'series') =>
  literal(
    `(SELECT COUNT(*) FROM \`${table}\` WHERE \`${table}\`.\`genreId\` = \`Genre\`.\`id\`)`
  );

export function createSequelizeGenreRepository(): GenreRepository {
  return {
    async list({ nonEmpty = false } = {}) {
      // ORDER BY name under the column's utf8mb4_0900_ai_ci collation, so the
      // order ignores case exactly as the uniqueness does. The non-empty
      // side is a fixed subquery, as visibleSeriesWhere's is: it carries no
      // caller-supplied value.
      const genres = await Genre.findAll({
        where: nonEmpty
          ? {
              [Op.or]: [
                { id: { [Op.in]: literal(NON_EMPTY_IDS) } },
                {
                  id: {
                    [Op.in]: literal(
                      `(SELECT \`g\`.\`parentId\` FROM \`genres\` AS \`g\` WHERE \`g\`.\`parentId\` IS NOT NULL AND \`g\`.\`id\` IN ${NON_EMPTY_IDS})`
                    ),
                  },
                },
              ],
            }
          : {},
        order: [['name', 'ASC']],
      });
      return genres.map(({ id, name, parentId }) => ({ id, name, parentId }));
    },

    async listWithCounts() {
      const genres = await Genre.findAll({
        attributes: {
          include: [
            [ownRowCount('books'), 'bookCount'],
            [ownRowCount('series'), 'seriesCount'],
          ],
        },
        order: [['name', 'ASC']],
      });
      return genres.map((genre) => ({
        id: genre.id,
        name: genre.name,
        parentId: genre.parentId,
        bookCount: Number(genre.get('bookCount')),
        seriesCount: Number(genre.get('seriesCount')),
      }));
    },

    async create(input) {
      try {
        return await sequelizeOf().transaction(async (transaction) => {
          const parent =
            typeof input.parentId === 'number'
              ? assertTopLevelParent(
                  await Genre.findByPk(input.parentId, {
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                  })
                )
              : null;
          const genre = await Genre.create(input, { transaction });
          return toPublicGenre(genre, parent);
        });
      } catch (error) {
        asConflict(error);
      }
    },

    async update(id, input) {
      try {
        return await sequelizeOf().transaction(async (transaction) => {
          const { parentId } = input;
          const wanted = typeof parentId === 'number' ? parentId : null;
          // The lower id is locked first, so two moves between the same pair
          // of rows cannot wait on each other.
          const locked = await Genre.findAll({
            where: { id: wanted === null ? id : [id, wanted] },
            order: [['id', 'ASC']],
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          const genre = locked.find((row) => row.id === id);
          if (!genre) return null;

          if (wanted !== null) {
            if (wanted === id) throw parentError('self');
            assertTopLevelParent(locked.find((row) => row.id === wanted));
            const subgenres = await Genre.count({
              where: { parentId: id },
              transaction,
            });
            if (subgenres > 0) throw parentError('hasSubgenres');
          }

          if (Object.keys(input).length > 0) {
            await genre.update(input, { transaction });
          }
          const parent =
            genre.parentId === null
              ? null
              : await Genre.findByPk(genre.parentId, {
                  attributes: ['id', 'name'],
                  transaction,
                });
          return toPublicGenre(genre, parent);
        });
      } catch (error) {
        asConflict(error);
      }
    },

    async remove(id) {
      // The foreign keys do the rest: books.genreId and series.genreId are
      // ON DELETE SET NULL, so the delete also leaves every Book and Series in
      // the Genre without one. genres.parentId is RESTRICT, which backs the
      // count below against a Subgenre inserted while this runs.
      try {
        return await sequelizeOf().transaction(async (transaction) => {
          const genre = await Genre.findByPk(id, {
            attributes: ['id'],
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!genre) return false;
          if ((await Genre.count({ where: { parentId: id }, transaction })) > 0)
            throw hasSubgenres();
          await genre.destroy({ transaction });
          return true;
        });
      } catch (error) {
        if (error instanceof ForeignKeyConstraintError) throw hasSubgenres();
        throw error;
      }
    },
  };
}
