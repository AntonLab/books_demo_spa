import { ForeignKeyConstraintError, Op } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import {
  Comment,
  toCommentWithAuthor,
  toPublicComment,
} from '../models/Comment.ts';
import { Book } from '../models/Book.ts';
import { Like } from '../models/Like.ts';
import { User, toAuthorSummary } from '../models/User.ts';
import { ForbiddenError, NotFoundError } from '../types/errors.ts';
import { loadAvatarUrls } from './userRepository.ts';
import type { CommentWithAuthor, PublicComment, Tombstone } from 'shared';
import type {
  CreateCommentInput,
  ListCommentsQuery,
  UpdateCommentInput,
} from '../types/comment.ts';
import { readableBookInclude, type Viewer } from './visibility.ts';

export interface CommentListResult {
  items: CommentWithAuthor[];
  total: number;
}

export interface CommentRepository {
  // actorId is separate from the input rather than folded into it, so the type
  // itself says the author is not caller-supplied data. See types/comment.ts.
  create(input: CreateCommentInput, actorId: number): Promise<PublicComment>;
  // Both leave out the comments on a Draft book the viewer may not read, and
  // the viewer is also who viewerLikeId is reported for.
  list(query: ListCommentsQuery, viewer: Viewer): Promise<CommentListResult>;
  findById(id: number, viewer: Viewer): Promise<PublicComment | null>;
  update(id: number, input: UpdateCommentInput): Promise<PublicComment | null>;
  // `kind` is decided by the caller, who knows whether the actor owns the
  // comment. Scoped to live rows, so a tombstone reports false.
  remove(id: number, kind: Tombstone): Promise<boolean>;
  // Only a `removed` comment comes back; null for anything else.
  restore(id: number): Promise<PublicComment | null>;
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
  // Tombstones are anonymous, so an owner filter must never reach one — it
  // would name exactly the person the tombstone hides.
  if (query.userId !== undefined) {
    clauses.push({ userId: query.userId, tombstone: null });
  }
  if (query.parentId !== undefined) clauses.push({ parentId: query.parentId });

  return clauses.length > 0 ? { [Op.and]: clauses } : {};
}

export function createSequelizeCommentRepository(): CommentRepository {
  return {
    async create(input, actorId) {
      // Nobody comments on a Draft book — not even its Co-authors: a draft
      // is not out yet, and there is nothing for a reader to answer. A missing
      // book falls through to the foreign key, which reports it as before.
      const book = await Book.findByPk(input.bookId, {
        attributes: ['status'],
      });
      if (book?.status === 'draft') {
        throw new ForbiddenError('You cannot comment on a draft book');
      }

      // A reply needs a live parent. Checked before the insert because the
      // foreign key only knows the parent exists, not that it is a tombstone.
      // A parent tombstoned between this check and the insert leaves the
      // reply under a fresh tombstone — the same outcome as replying a moment
      // earlier, so the window is harmless.
      if (input.parentId !== null) {
        const parent = await Comment.findByPk(input.parentId, {
          attributes: ['id', 'tombstone'],
        });
        if (!parent) throw new NotFoundError('Comment', input.parentId);
        if (parent.tombstone !== null) {
          throw new ForbiddenError('You cannot reply to a deleted comment');
        }
      }

      try {
        // userId comes from the caller's session, never from the body.
        const comment = await Comment.create({ ...input, userId: actorId });
        return toPublicComment(comment);
      } catch (error) {
        asMissingReference(error, input, actorId);
      }
    },

    async list(query, viewer) {
      const viewerId = viewer?.id ?? null;
      const { rows, count } = await Comment.findAndCountAll({
        where: buildWhere(query),
        include: [
          { model: User, as: 'user' },
          await readableBookInclude(viewer),
        ],
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

      const avatarUrls = await loadAvatarUrls(
        rows.flatMap((row) => (row.user ? [row.user.id] : []))
      );

      return {
        items: rows.map((row) => {
          // A live comment always has its owner loaded: the include is
          // unconditional. Only a tombstone can have none — its account was
          // deleted — and a tombstone names no author anyway.
          if (!row.user && (row.tombstone ?? null) === null) {
            throw new Error(`comment ${row.id} has no author loaded`);
          }

          return toCommentWithAuthor(
            row,
            row.user
              ? toAuthorSummary(row.user, avatarUrls.get(row.user.id) ?? null)
              : null,
            counts.get(row.id) ?? 0,
            viewerLikes.get(row.id) ?? null
          );
        }),
        total: count,
      };
    },

    async findById(id, viewer) {
      const comment = await Comment.findOne({
        where: { id },
        include: [await readableBookInclude(viewer)],
      });
      return comment ? toPublicComment(comment) : null;
    },

    // Scoped to live rows, like remove(). The controller already refuses a
    // tombstone, but an edit it let in while the comment was live can still
    // lose the race to a moderator's removal — and text written onto the
    // hidden row would be published by a later restore no moderator saw.
    async update(id, input) {
      // No FK mapping here: updateCommentSchema carries only `text`, so an
      // update cannot violate a constraint.
      const [changed] = await Comment.update(input, {
        where: { id, tombstone: null },
      });

      const comment = await Comment.findByPk(id);
      if (!comment) return null;
      // Sequelize connects with FOUND_ROWS off, so MySQL counts changed rows,
      // not matched ones — and a live comment resubmitted unchanged within
      // the column's one-second precision changes nothing. Only a tombstone
      // turns that 0 into a refusal.
      if (changed === 0 && comment.tombstone !== null) return null;
      return toPublicComment(comment);
    },

    // A soft delete: the row survives so its replies keep a parent, and the
    // thread stays readable around the gap. Only this comment is marked — a
    // reply is somebody else's writing and is not theirs to remove. Scoped to
    // live rows, so a second call reports false and the route answers 404.
    async remove(id, kind) {
      const [affected] = await Comment.update(
        { tombstone: kind },
        { where: { id, tombstone: null } }
      );
      return affected > 0;
    },

    // The inverse of a moderator's delete. Scoped to `removed`: an owner's
    // deletion is theirs to make and nobody else's to undo.
    async restore(id) {
      const [affected] = await Comment.update(
        { tombstone: null },
        { where: { id, tombstone: 'removed' } }
      );
      if (affected === 0) return null;

      const comment = await Comment.findByPk(id);
      return comment ? toPublicComment(comment) : null;
    },
  };
}
