import { ForeignKeyConstraintError, Op } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import {
  Comment,
  toCommentWithAuthor,
  toPublicComment,
} from '../models/Comment.ts';
import { Like } from '../models/Like.ts';
import { User, toAuthorSummary } from '../models/User.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  CommentWithAuthor,
  CreateCommentInput,
  ListCommentsQuery,
  PublicComment,
  UpdateCommentInput,
} from '../types/comment.ts';

export interface CommentListResult {
  items: CommentWithAuthor[];
  total: number;
}

export interface CommentRepository {
  // actorId is separate from the input rather than folded into it, so the type
  // itself says the author is not caller-supplied data. See types/comment.ts.
  create(input: CreateCommentInput, actorId: number): Promise<PublicComment>;
  list(
    query: ListCommentsQuery,
    viewerId: number | null
  ): Promise<CommentListResult>;
  findById(id: number): Promise<PublicComment | null>;
  update(id: number, input: UpdateCommentInput): Promise<PublicComment | null>;
  remove(id: number): Promise<boolean>;
}

// A rejected FK on `comments` means the referenced row does not exist.
// Reporting that as a 404 is more useful than the generic 500 an unmapped
// SequelizeForeignKeyConstraintError would produce.
//
// The same shape as likeRepository's, stretched to three keys: MySQL names the
// offending column in the constraint text, which is the only place they are
// distinguishable. parentId is only a candidate when one was supplied, and
// userId is the safe fallback because every row carries it.
function asMissingReference(
  error: unknown,
  input: CreateCommentInput,
  actorId: number
): never {
  if (error instanceof ForeignKeyConstraintError) {
    const detail = `${error.index ?? ''} ${error.parent?.message ?? error.message}`;

    if (detail.includes('bookId')) {
      throw new NotFoundError('Book', input.bookId);
    }
    if (input.parentId !== null && detail.includes('parentId')) {
      throw new NotFoundError('Comment', input.parentId);
    }
    throw new NotFoundError('User', actorId);
  }
  throw error;
}

function buildWhere(query: ListCommentsQuery): WhereOptions {
  const clauses: WhereOptions[] = [];

  if (query.bookId !== undefined) clauses.push({ bookId: query.bookId });
  if (query.userId !== undefined) clauses.push({ userId: query.userId });
  if (query.parentId !== undefined) clauses.push({ parentId: query.parentId });

  return clauses.length > 0 ? { [Op.and]: clauses } : {};
}

// Walks the reply tree breadth-first and returns every id at or below `rootId`.
//
// The foreign key stays ON DELETE SET NULL rather than CASCADE, because InnoDB
// cannot recurse a self-referential cascade past 15 levels without
// ER_FK_DEPTH_EXCEEDED — and that failure takes the owning book's delete down
// with it, not just the thread's. Collecting the ids here and issuing one
// DELETE has no depth limit at all. The measurement behind that choice is
// recorded in models/index.ts.
async function collectSubtreeIds(rootId: number): Promise<number[]> {
  const ids = [rootId];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await Comment.findAll({
      attributes: ['id'],
      where: { parentId: frontier },
      raw: true,
    });

    frontier = children.map((child) => child.id);
    ids.push(...frontier);
  }

  return ids;
}

export function createSequelizeCommentRepository(): CommentRepository {
  return {
    async create(input, actorId) {
      try {
        // userId comes from the caller's session, never from the body.
        const comment = await Comment.create({ ...input, userId: actorId });
        return toPublicComment(comment);
      } catch (error) {
        asMissingReference(error, input, actorId);
      }
    },

    async list(query, viewerId) {
      const { rows, count } = await Comment.findAndCountAll({
        where: buildWhere(query),
        include: [{ model: User, as: 'user' }],
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'ASC']],
      });

      const ids = rows.map((row) => row.id);

      // One follow-up query for the whole page rather than one per comment. It
      // fetches the page's like rows and folds them into a count and the
      // viewer's own id in a single pass, which is why there is no second
      // round trip for "did I like this".
      const likes =
        ids.length === 0
          ? []
          : await Like.findAll({
              attributes: ['id', 'commentId', 'userId'],
              where: { commentId: ids, isLike: true },
              raw: true,
            });

      const counts = new Map<number, number>();
      const viewerLikes = new Map<number, number>();
      for (const like of likes) {
        if (like.commentId === null) continue;
        counts.set(like.commentId, (counts.get(like.commentId) ?? 0) + 1);
        if (viewerId !== null && like.userId === viewerId) {
          viewerLikes.set(like.commentId, like.id);
        }
      }

      return {
        items: rows.map((row) => {
          // The include is unconditional and userId is NOT NULL, so this cannot
          // be missing in practice; the guard is what keeps the NonAttribute's
          // optionality honest without a non-null assertion.
          if (!row.user) {
            throw new Error(`comment ${row.id} has no author loaded`);
          }

          return toCommentWithAuthor(
            row,
            toAuthorSummary(row.user),
            counts.get(row.id) ?? 0,
            viewerLikes.get(row.id) ?? null
          );
        }),
        total: count,
      };
    },

    async findById(id) {
      const comment = await Comment.findByPk(id);
      return comment ? toPublicComment(comment) : null;
    },

    async update(id, input) {
      const comment = await Comment.findByPk(id);
      if (!comment) return null;

      // No FK mapping here: updateCommentSchema carries only `text`, so an
      // update cannot violate a constraint.
      await comment.update(input);
      return toPublicComment(comment);
    },

    async remove(id) {
      const sequelize = Comment.sequelize;
      if (!sequelize) {
        throw new Error('Comment model is not initialised');
      }

      // The walk and the delete share a transaction so a reply posted midway
      // cannot be orphaned by a delete that has already collected its ids.
      return sequelize.transaction(async (transaction) => {
        const ids = await collectSubtreeIds(id);
        const deleted = await Comment.destroy({
          where: { id: ids },
          transaction,
        });
        return deleted > 0;
      });
    },
  };
}
