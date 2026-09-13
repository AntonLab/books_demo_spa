import {
  ForeignKeyConstraintError,
  Op,
  UniqueConstraintError,
} from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { Book } from '../models/Book.ts';
import { BookAuthor } from '../models/BookAuthor.ts';
import { Comment } from '../models/Comment.ts';
import { Like, toPublicLike } from '../models/Like.ts';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../types/errors.ts';
import type {
  CreateLikeInput,
  ListLikesQuery,
  PublicLike,
  UpdateLikeInput,
} from '../types/like.ts';
import { hiddenBookIds, type Viewer } from './visibility.ts';

// Not to be confused with likePattern.ts next door, which is about the SQL
// LIKE operator and has nothing to do with this resource.

export interface LikeListResult {
  items: PublicLike[];
  total: number;
}

export interface LikeRepository {
  // actorId is separate from the input rather than folded into it, so the type
  // itself says the liker is not caller-supplied data. See types/like.ts.
  create(input: CreateLikeInput, actorId: number): Promise<PublicLike>;
  // Both leave out the likes on a Draft book the viewer may not read, and on
  // the comments under one.
  list(query: ListLikesQuery, viewer: Viewer): Promise<LikeListResult>;
  findById(id: number, viewer: Viewer): Promise<PublicLike | null>;
  update(id: number, input: UpdateLikeInput): Promise<PublicLike | null>;
  remove(id: number): Promise<boolean>;
}

// A rejected FK on `likes` means the referenced row does not exist. Reporting
// that as a 404 is more useful than the generic 500 an unmapped
// SequelizeForeignKeyConstraintError would produce.
//
// The same shape as bookRepository's, stretched to three keys: MySQL names the
// offending column in the constraint text, which is the only place they are
// distinguishable. Each target is only a candidate when one was supplied — a
// like fills exactly one of them — so userId is the safe fallback, as it is
// the only key every row carries.
function asMissingReference(
  error: unknown,
  input: CreateLikeInput,
  actorId: number
): never {
  if (error instanceof ForeignKeyConstraintError) {
    const detail = `${error.index ?? ''} ${error.parent?.message ?? error.message}`;

    if (input.bookId !== null && detail.includes('bookId')) {
      throw new NotFoundError('Book', input.bookId);
    }
    if (input.commentId !== null && detail.includes('commentId')) {
      throw new NotFoundError('Comment', input.commentId);
    }
    throw new NotFoundError('User', actorId);
  }
  throw error;
}

// One like per user per target, enforced by the unique indexes rather than a
// findOne before the insert — that would be a check-then-write race and an
// extra query on every like. Changing one's mind is a PATCH, not a second POST.
// Nobody may like their own book or their own comment, and nobody may like a
// tombstoned comment. This is the one check-then-write in this repository,
// and it is safe where the uniqueness check would not be: a comment's owner
// never changes, and a book's credits changing mid-request is covered below.
async function assertLikeable(
  input: CreateLikeInput,
  actorId: number
): Promise<void> {
  if (input.bookId !== null) {
    const book = await Book.findByPk(input.bookId, {
      attributes: ['id', 'status'],
    });
    if (!book) throw new NotFoundError('Book', input.bookId);
    // Nobody likes a Draft book, its Co-authors and Moderators included.
    if (book.status === 'draft') {
      throw new ForbiddenError('You cannot like a draft book');
    }
    // Every Co-author counts as the book's own, not just whoever created it.
    // Unlike a comment's owner, credits do change — but a co-author added
    // between this check and the insert could at worst leave one like that
    // predates their credit, which is no worse than liking before being added.
    const credited = await BookAuthor.count({
      where: { bookId: input.bookId, userId: actorId },
    });
    if (credited > 0) {
      throw new ForbiddenError('You cannot like your own book');
    }
    return;
  }

  if (input.commentId !== null) {
    const comment = await Comment.findByPk(input.commentId, {
      attributes: ['userId', 'tombstone'],
      include: [{ model: Book, as: 'book', attributes: ['status'] }],
    });
    if (!comment) throw new NotFoundError('Comment', input.commentId);
    // A comment on a Draft book is not out either.
    if (comment.book?.status === 'draft') {
      throw new ForbiddenError('You cannot like a comment on a draft book');
    }
    // A tombstone takes no new reactions: a like there would be a vote on a
    // comment nobody can see.
    if (comment.tombstone !== null) {
      throw new ForbiddenError('You cannot like a deleted comment');
    }
    if (comment.userId === actorId) {
      throw new ForbiddenError('You cannot like your own comment');
    }
  }
}

function asConflict(error: unknown): never {
  if (error instanceof UniqueConstraintError) {
    throw new ConflictError('like');
  }
  throw error;
}

// Leaves out the likes on a Draft book the viewer may not read, and on the
// comments under one. NULL-safe on both columns: every like leaves one of them
// empty, and `NOT IN` alone would drop those rows too.
async function visibleLikeWhere(viewer: Viewer): Promise<WhereOptions> {
  const hiddenBooks = await hiddenBookIds(viewer);
  if (hiddenBooks.length === 0) return {};

  const hiddenComments = (
    await Comment.findAll({
      where: { bookId: hiddenBooks },
      attributes: ['id'],
    })
  ).map((comment) => comment.id);

  const clauses: WhereOptions[] = [
    { [Op.or]: [{ bookId: null }, { bookId: { [Op.notIn]: hiddenBooks } }] },
  ];
  if (hiddenComments.length > 0) {
    clauses.push({
      [Op.or]: [
        { commentId: null },
        { commentId: { [Op.notIn]: hiddenComments } },
      ],
    });
  }
  return { [Op.and]: clauses };
}

function buildWhere(query: ListLikesQuery): WhereOptions {
  const clauses: WhereOptions[] = [];

  if (query.userId !== undefined) {
    clauses.push({ userId: query.userId });
  }

  if (query.bookId !== undefined) {
    clauses.push({ bookId: query.bookId });
  }

  if (query.commentId !== undefined) {
    clauses.push({ commentId: query.commentId });
  }

  // Compared against undefined, not truthiness: `?isLike=false` is a real
  // filter for dislikes, and `if (query.isLike)` would silently drop it.
  if (query.isLike !== undefined) {
    clauses.push({ isLike: query.isLike });
  }

  return clauses.length > 0 ? { [Op.and]: clauses } : {};
}

export function createSequelizeLikeRepository(): LikeRepository {
  return {
    async create(input, actorId) {
      await assertLikeable(input, actorId);

      try {
        const like = await Like.create({ ...input, userId: actorId });
        return toPublicLike(like);
      } catch (error) {
        // A unique violation and a missing reference are different answers —
        // 409 for "you already voted", 404 for "that book is not there" — so
        // the two are mapped separately rather than through one catch-all.
        if (error instanceof UniqueConstraintError) asConflict(error);
        asMissingReference(error, input, actorId);
      }
    },

    async list(query, viewer) {
      // No attributes list, unlike chapterRepository: every column here is a
      // number or a boolean, so there is no large one worth omitting.
      const { rows, count } = await Like.findAndCountAll({
        where: {
          [Op.and]: [buildWhere(query), await visibleLikeWhere(viewer)],
        },
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'ASC']],
      });

      return { items: rows.map(toPublicLike), total: count };
    },

    async findById(id, viewer) {
      const like = await Like.findOne({
        where: { [Op.and]: [{ id }, await visibleLikeWhere(viewer)] },
      });
      return like ? toPublicLike(like) : null;
    },

    async update(id, input) {
      const like = await Like.findByPk(id);
      if (!like) return null;

      // Flipping counts as a new reaction as far as a tombstone is concerned.
      // Removing your own like does not, which is why remove() has no such
      // check.
      if (like.commentId !== null) {
        const comment = await Comment.findByPk(like.commentId, {
          attributes: ['tombstone'],
        });
        if (comment !== null && comment.tombstone !== null) {
          throw new ForbiddenError(
            'You cannot change a like on a deleted comment'
          );
        }
      }

      // Neither an FK nor a unique mapping here: updateLikeSchema carries
      // isLike alone, so an update can touch neither a foreign key nor a
      // column either unique index is built on.
      await like.update(input);
      return toPublicLike(like);
    },

    async remove(id) {
      const deleted = await Like.destroy({ where: { id } });
      return deleted > 0;
    },
  };
}
