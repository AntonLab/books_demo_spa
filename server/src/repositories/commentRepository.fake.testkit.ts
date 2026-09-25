import { NotFoundError } from '../types/errors.ts';
import type { CommentWithAuthor, PublicComment, AuthorSummary } from 'shared';
import type {
  CommentListResult,
  CommentRepository,
} from './commentRepository.ts';

export interface FakeCommentRepositoryOptions {
  // The accounts that exist, by id. Stands in for users.id: a comment by
  // anyone else is refused, and a live comment's `author` is its summary.
  accounts?: ReadonlyMap<number, AuthorSummary>;
  // The books that exist. Read, never written, so a caller may keep adding.
  books?: ReadonlySet<number>;
  // Comments already there, as stored: a tombstone keeps its text and owner
  // here, and only the answers withhold them.
  seed?: PublicComment[];
  // The id a signed-in viewer's own like on each comment carries; the likes
  // themselves live in another repository.
  viewerLikeId?: number | null;
}

// An in-memory CommentRepository for the route specs, held to the real one by
// commentRepository.contract.testkit.ts on the parts the controllers rely on.
//
// The domain rules stay in the real repository and are covered against MySQL:
// Draft books are readable here and take comments, and a reply to a tombstone
// is not refused. What a tombstone withholds, and that only a live comment
// becomes one, is kept, because the routes answer from it.
export function createFakeCommentRepository(
  options: FakeCommentRepositoryOptions = {}
): CommentRepository {
  const {
    accounts = new Map(),
    books = new Set(),
    seed = [],
    viewerLikeId = null,
  } = options;
  const rows = new Map<number, PublicComment>(seed.map((row) => [row.id, row]));
  let nextId = 1;

  // Mirrors toPublicComment: a tombstone withholds its text and its owner.
  const publicView = (row: PublicComment): PublicComment =>
    row.tombstone === null ? row : { ...row, text: '', userId: null };

  return {
    async create(input, actorId) {
      // Stand in for the parent lookup and the foreign keys, which the real
      // repository reports as these same NotFoundErrors.
      if (input.parentId !== null && !rows.has(input.parentId)) {
        throw new NotFoundError('Comment', input.parentId);
      }
      if (!books.has(input.bookId)) {
        throw new NotFoundError('Book', input.bookId);
      }
      if (!accounts.has(actorId)) throw new NotFoundError('User', actorId);

      while (rows.has(nextId)) nextId += 1;
      const now = new Date();
      const comment: PublicComment = {
        id: nextId,
        parentId: input.parentId,
        userId: actorId,
        bookId: input.bookId,
        text: input.text,
        tombstone: null,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(comment.id, comment);
      return comment;
    },

    async list(query, viewer): Promise<CommentListResult> {
      const matching = [...rows.values()]
        .filter(
          (row) =>
            (query.bookId === undefined || row.bookId === query.bookId) &&
            (query.userId === undefined ||
              (row.tombstone === null && row.userId === query.userId)) &&
            (query.parentId === undefined || row.parentId === query.parentId)
        )
        .sort((a, b) => a.id - b.id);

      return {
        items: matching
          .slice(query.offset, query.offset + query.limit)
          .map((row): CommentWithAuthor => ({
            ...publicView(row),
            // Mirrors the real serialiser: a tombstone is anonymous.
            author:
              row.tombstone !== null || row.userId === null
                ? null
                : (accounts.get(row.userId) ?? null),
            likeCount: 0,
            // Only a signed-in caller can have a like of their own to report.
            viewerLikeId: viewer === null ? null : viewerLikeId,
          })),
        total: matching.length,
      };
    },

    async findById(id) {
      const row = rows.get(id);
      return row ? publicView(row) : null;
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;

      const updated: PublicComment = {
        ...current,
        text: input.text,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return publicView(updated);
    },

    // A soft delete, like the real repository: scoped to live rows, so a
    // second call reports false. The stored row keeps its text, as MySQL's
    // does; publicView is what withholds it.
    async remove(id, kind) {
      const current = rows.get(id);
      if (!current || current.tombstone !== null) return false;

      rows.set(id, { ...current, tombstone: kind });
      return true;
    },

    async restore(id) {
      const current = rows.get(id);
      if (!current || current.tombstone !== 'removed') return null;

      const restored: PublicComment = { ...current, tombstone: null };
      rows.set(id, restored);
      return restored;
    },
  };
}
