import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../types/errors.ts';
import type { PublicLike } from 'shared';
import type { LikeListResult, LikeRepository } from './likeRepository.ts';

export interface FakeLikeRepositoryOptions {
  // The accounts that exist. Stands in for users.id.
  accounts?: ReadonlySet<number>;
  // bookId -> its Co-author ids: which books exist, and who may not like each.
  books?: ReadonlyMap<number, number[]>;
  // commentId -> its owner's id: which comments exist, and who may not like
  // each.
  comments?: ReadonlyMap<number, number>;
  // Likes already there.
  seed?: PublicLike[];
}

// An in-memory LikeRepository for the route specs, held to the real one by
// likeRepository.contract.testkit.ts on the parts the controllers rely on.
//
// Nobody likes their own book or comment here, as in the real repository,
// because the routes answer from that refusal. The rest stays in the real
// repository and is covered against MySQL: Draft books are visible and
// likeable here, and a tombstone takes new likes and flips.
export function createFakeLikeRepository(
  options: FakeLikeRepositoryOptions = {}
): LikeRepository {
  const {
    accounts = new Set(),
    books = new Map(),
    comments = new Map(),
    seed = [],
  } = options;
  const rows = new Map<number, PublicLike>(seed.map((row) => [row.id, row]));
  let nextId = 1;

  return {
    async create(input, actorId) {
      // The target first, as the real repository loads it before the insert.
      if (input.bookId !== null) {
        const coAuthorIds = books.get(input.bookId);
        if (!coAuthorIds) throw new NotFoundError('Book', input.bookId);
        if (coAuthorIds.includes(actorId)) {
          throw new ForbiddenError('You cannot like your own book');
        }
      }
      if (input.commentId !== null) {
        const ownerId = comments.get(input.commentId);
        if (ownerId === undefined) {
          throw new NotFoundError('Comment', input.commentId);
        }
        if (ownerId === actorId) {
          throw new ForbiddenError('You cannot like your own comment');
        }
      }
      // Stand in for the foreign key on userId and the unique indexes on
      // (userId, bookId) and (userId, commentId).
      if (!accounts.has(actorId)) throw new NotFoundError('User', actorId);
      const taken = [...rows.values()].some(
        (row) =>
          row.userId === actorId &&
          row.bookId === input.bookId &&
          row.commentId === input.commentId
      );
      if (taken) throw new ConflictError('like');

      while (rows.has(nextId)) nextId += 1;
      const like: PublicLike = {
        id: nextId,
        userId: actorId,
        bookId: input.bookId,
        commentId: input.commentId,
        isLike: input.isLike,
        createdAt: new Date(),
      };
      rows.set(like.id, like);
      return like;
    },

    async list(query): Promise<LikeListResult> {
      const matching = [...rows.values()]
        .filter(
          (row) =>
            (query.userId === undefined || row.userId === query.userId) &&
            (query.bookId === undefined || row.bookId === query.bookId) &&
            (query.commentId === undefined ||
              row.commentId === query.commentId) &&
            (query.isLike === undefined || row.isLike === query.isLike)
        )
        .sort((a, b) => a.id - b.id);

      return {
        items: matching.slice(query.offset, query.offset + query.limit),
        total: matching.length,
      };
    },

    async findById(id) {
      return rows.get(id) ?? null;
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;

      const updated: PublicLike = { ...current, isLike: input.isLike };
      rows.set(id, updated);
      return updated;
    },

    async remove(id) {
      return rows.delete(id);
    },
  };
}
