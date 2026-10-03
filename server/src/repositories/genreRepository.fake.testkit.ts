import type { GenreListItem, PublicGenre } from 'shared';
import {
  hasSubgenres,
  parentError,
  siblingNameTaken,
  type GenreRepository,
} from './genreRepository.ts';

export interface FakeGenreRepositoryOptions {
  // The Genres that already exist, in any order — the repository sorts them
  // itself. Copied in, so a caller's array is never written to.
  seeds?: readonly { id: number; name: string; parentId?: number | null }[];
  // Spy: what each list call asked for. The fake holds no books, so it
  // cannot tell which Genres are non-empty and returns them all.
  listCalls?: { nonEmpty: boolean }[];
  // What listWithCounts reports per Genre id; absent ids count zero.
  counts?: ReadonlyMap<number, { bookCount: number; seriesCount: number }>;
}

// Alphabetical, case-insensitively, which is what MySQL's
// utf8mb4_0900_ai_ci collation does for `ORDER BY name`. The id is the
// tie-break for names that differ only in accents, which the unique index does
// not separate and no test pins.
function byName(left: GenreListItem, right: GenreListItem): number {
  const a = left.name.toLowerCase();
  const b = right.name.toLowerCase();
  if (a !== b) return a < b ? -1 : 1;
  return left.id - right.id;
}

// An in-memory GenreRepository for the route specs, held to the real one by
// genreRepository.contract.testkit.ts.
export function createFakeGenreRepository(
  options: FakeGenreRepositoryOptions = {}
): GenreRepository {
  const rows = new Map<number, GenreListItem>();
  let nextId = 1;
  for (const seed of options.seeds ?? []) {
    rows.set(seed.id, { ...seed, parentId: seed.parentId ?? null });
    nextId = Math.max(nextId, seed.id + 1);
  }

  // Stands in for the unique index under the table's case-insensitive
  // collation: lower-casing here is what makes the fake's 409 the same 409
  // MySQL raises. A name is unique within its parent, the top level being one
  // scope; `exceptId` is the row being changed, which never collides with
  // itself.
  const taken = (
    name: string,
    parentId: number | null,
    exceptId: number | null
  ): boolean =>
    [...rows.values()].some(
      (row) =>
        row.id !== exceptId &&
        (row.parentId ?? 0) === (parentId ?? 0) &&
        row.name.toLowerCase() === name.toLowerCase()
    );

  const hasChildren = (id: number): boolean =>
    [...rows.values()].some((row) => row.parentId === id);

  const assertTopLevelParent = (parentId: number): void => {
    const parent = rows.get(parentId);
    if (!parent) throw parentError('missing');
    if (parent.parentId !== null) throw parentError('notTopLevel');
  };

  const present = (row: GenreListItem): PublicGenre => {
    const parent = row.parentId === null ? undefined : rows.get(row.parentId);
    return {
      id: row.id,
      name: row.name,
      parent: parent ? { id: parent.id, name: parent.name } : null,
    };
  };

  return {
    async list({ nonEmpty = false } = {}) {
      options.listCalls?.push({ nonEmpty });
      return [...rows.values()].sort(byName).map((row) => ({ ...row }));
    },

    async listWithCounts() {
      return [...rows.values()].sort(byName).map((row) => ({
        ...row,
        bookCount: 0,
        seriesCount: 0,
        ...options.counts?.get(row.id),
      }));
    },

    async create(input) {
      const parentId = input.parentId ?? null;
      if (parentId !== null) assertTopLevelParent(parentId);
      if (taken(input.name, parentId, null)) throw siblingNameTaken();

      const genre: GenreListItem = { id: nextId, name: input.name, parentId };
      nextId += 1;
      rows.set(genre.id, genre);
      return present(genre);
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;

      const parentId =
        input.parentId === undefined ? current.parentId : input.parentId;
      if (typeof input.parentId === 'number') {
        if (input.parentId === id) throw parentError('self');
        assertTopLevelParent(input.parentId);
        if (hasChildren(id)) throw parentError('hasSubgenres');
      }
      const name = input.name ?? current.name;
      if (taken(name, parentId, id)) throw siblingNameTaken();

      const updated: GenreListItem = { id, name, parentId };
      rows.set(id, updated);
      return present(updated);
    },

    async remove(id) {
      if (hasChildren(id)) throw hasSubgenres();
      return rows.delete(id);
    },
  };
}
