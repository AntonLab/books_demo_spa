import { ConflictError } from '../types/errors.ts';
import type { PublicGenre } from '../types/genre.ts';
import type { GenreRepository } from './genreRepository.ts';

export interface FakeGenreRepositoryOptions {
  // The Genres that already exist, in any order — the repository sorts them
  // itself. Copied in, so a caller's array is never written to.
  seeds?: readonly PublicGenre[];
  // Spy: what each list call asked for. The fake holds no books, so it
  // cannot tell which Genres are non-empty and returns them all.
  listCalls?: { nonEmpty: boolean }[];
}

// Alphabetical, case-insensitively, which is what MySQL's
// utf8mb4_0900_ai_ci collation does for `ORDER BY name` (M1). The id is the
// tie-break for names that differ only in accents, which the unique index does
// not separate and no test pins.
function byName(left: PublicGenre, right: PublicGenre): number {
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
  const rows = new Map<number, PublicGenre>();
  let nextId = 1;
  for (const seed of options.seeds ?? []) {
    rows.set(seed.id, { ...seed });
    nextId = Math.max(nextId, seed.id + 1);
  }

  // Stands in for the unique index under the table's case-insensitive
  // collation: lower-casing here is what makes the fake's 409 the same 409
  // MySQL raises (M1). `exceptId` is the row being renamed, which never
  // collides with itself.
  const taken = (name: string, exceptId: number | null): boolean =>
    [...rows.values()].some(
      (row) =>
        row.id !== exceptId && row.name.toLowerCase() === name.toLowerCase()
    );

  return {
    async list({ nonEmpty = false } = {}) {
      options.listCalls?.push({ nonEmpty });
      return [...rows.values()].sort(byName).map((row) => ({ ...row }));
    },

    async create(input) {
      if (taken(input.name, null)) throw new ConflictError('name');

      const genre: PublicGenre = { id: nextId, name: input.name };
      nextId += 1;
      rows.set(genre.id, genre);
      return { ...genre };
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;
      if (taken(input.name, id)) throw new ConflictError('name');

      const updated: PublicGenre = { ...current, name: input.name };
      rows.set(id, updated);
      return { ...updated };
    },

    async remove(id) {
      return rows.delete(id);
    },
  };
}
