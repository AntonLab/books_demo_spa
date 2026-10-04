import { ForeignKeyConstraintError, Op } from 'sequelize';
import type { Sequelize, WhereOptions } from 'sequelize';
import {
  Comment,
  toCommentWithAuthor,
  toPublicComment,
} from '../models/Comment.ts';
import { Book } from '../models/Book.ts';
import { Like } from '../models/Like.ts';
import { Report } from '../models/Report.ts';
import { User, toAuthorSummary } from '../models/User.ts';
import { ForbiddenError, NotFoundError } from '../types/errors.ts';
import { loadAvatarUrls } from './userRepository.ts';
import { shouldReopen } from '../reportText.ts';
import { OPEN_REPORT_STATUSES } from 'shared';
import type {
  CommentWithAuthor,
  ListResponse,
  PublicComment,
  Tombstone,
} from 'shared';
import type {
  CreateCommentInput,
  ListCommentsQuery,
  UpdateCommentInput,
} from '../types/comment.ts';
import { readableBookInclude, type Viewer } from './visibility.ts';

export type CommentListResult = Pick<
  ListResponse<CommentWithAuthor>,
  'items' | 'total'
>;

export interface CommentRepository {
  // actorId is separate from the input rather than folded into it, so the type
  // itself says the author is not caller-supplied data. See types/comment.ts.
  create(input: CreateCommentInput, actorId: number): Promise<PublicComment>;
  // Both leave out the comments on a Draft book the viewer may not read, and
  // the viewer is also who viewerLikeId is reported for.
  list(query: ListCommentsQuery, viewer: Viewer): Promise<CommentListResult>;
  findById(id: number, viewer: Viewer): Promise<PublicComment | null>;
  // A large edit after a Dismissed report may open a System report; see
  // reportText.shouldReopen. A tombstone reports null.
  update(id: number, input: UpdateCommentInput): Promise<PublicComment | null>;
  // `kind` is decided by the caller, who knows whether the actor owns the
  // comment. Scoped to live rows, so a tombstone reports false. Open reports
  // settle with it: 'deleted' dismisses them, 'removed' upholds them and
  // records `actorId`, the Moderator, on each.
  remove(id: number, kind: Tombstone, actorId: number): Promise<boolean>;
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

function sequelizeOf(): Sequelize {
  const sequelize = Comment.sequelize;
  if (!sequelize) throw new Error('Comment model is not initialised');
  return sequelize;
}

export function createSequelizeCommentRepository(): CommentRepository {
  return {
    async create(input, actorId) {
      // Nobody comments on a Draft book, its Co-authors included: it is not
      // out yet. A missing book falls through to the foreign key.
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

      // A Guest has no reporterId clause: `reporterId = null` would match the
      // System reports.
      const reports =
        ids.length === 0
          ? []
          : await Report.findAll({
              attributes: ['id', 'commentId', 'reporterId', 'status'],
              where: {
                commentId: ids,
                [Op.or]: [
                  { status: [...OPEN_REPORT_STATUSES] },
                  ...(viewerId === null ? [] : [{ reporterId: viewerId }]),
                ],
              },
              raw: true,
            });

      const openReported = new Set<number>();
      const viewerReports = new Map<number, number>();
      for (const report of reports) {
        if (report.commentId === null) continue;
        if (
          (OPEN_REPORT_STATUSES as readonly string[]).includes(report.status)
        ) {
          openReported.add(report.commentId);
        }
        if (viewerId !== null && report.reporterId === viewerId) {
          viewerReports.set(report.commentId, report.id);
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
            viewerLikes.get(row.id) ?? null,
            {
              hasOpenReport: openReported.has(row.id),
              viewerReportedId: viewerReports.get(row.id) ?? null,
            }
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
      return sequelizeOf().transaction(async (transaction) => {
        // Locked first, the order reportRepository uses, so the two cannot
        // deadlock. A missing row or a tombstone is refused.
        const locked = await Comment.findByPk(id, {
          attributes: ['id', 'userId', 'tombstone'],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!locked || locked.tombstone !== null) return null;

        // No FK mapping here: updateCommentSchema carries only `text`, so an
        // update cannot violate a constraint.
        await Comment.update(input, { where: { id }, transaction });

        const open = await Report.count({
          where: { commentId: id, status: [...OPEN_REPORT_STATUSES] },
          transaction,
        });
        if (open === 0) {
          const latest = await Report.findOne({
            where: { commentId: id, status: ['upheld', 'dismissed'] },
            order: [
              ['settledAt', 'DESC'],
              ['id', 'DESC'],
            ],
            transaction,
          });
          if (
            latest?.status === 'dismissed' &&
            latest.settledText !== null &&
            shouldReopen(latest.settledText, input.text)
          ) {
            await Report.create(
              {
                reporterId: null,
                isSystem: true,
                commentId: id,
                reportedAccountId: locked.userId,
                reason: latest.reason,
                explanation: latest.explanation,
              },
              { transaction }
            );
          }
        }

        const comment = await Comment.findByPk(id, { transaction });
        return comment ? toPublicComment(comment) : null;
      });
    },

    // A soft delete: the row survives so its replies keep a parent, and the
    // thread stays readable around the gap. Only this comment is marked — a
    // reply is somebody else's writing and is not theirs to remove. Scoped to
    // live rows, so a second call reports false and the route answers 404.
    async remove(id, kind, actorId) {
      return sequelizeOf().transaction(async (transaction) => {
        const live = await Comment.findOne({
          where: { id, tombstone: null },
          attributes: ['id'],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!live) return false;

        await Comment.update(
          { tombstone: kind },
          { where: { id }, transaction }
        );
        await Report.update(
          kind === 'deleted'
            ? { status: 'dismissed', moderatorId: null, settledAt: new Date() }
            : { status: 'upheld', moderatorId: actorId, settledAt: new Date() },
          {
            where: { commentId: id, status: [...OPEN_REPORT_STATUSES] },
            transaction,
          }
        );
        return true;
      });
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
