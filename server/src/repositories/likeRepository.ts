import {
  ForeignKeyConstraintError,
  Op,
  UniqueConstraintError,
} from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { Like, toPublicLike } from '../models/Like.ts';
import { ConflictError, NotFoundError } from '../types/errors.ts';
import type {
  CreateLikeInput,
  ListLikesQuery,
  PublicLike,
  UpdateLikeInput,
} from '../types/like.ts';

// Not to be confused with likePattern.ts next door, which is about the SQL
// LIKE operator and has nothing to do with this resource.

export interface LikeListResult {
  items: PublicLike[];
  total: number;
}

export interface LikeRepository {
  create(input: CreateLikeInput): Promise<PublicLike>;
  list(query: ListLikesQuery): Promise<LikeListResult>;
  findById(id: number): Promise<PublicLike | null>;
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
function asMissingReference(error: unknown, input: CreateLikeInput): never {
  if (error instanceof ForeignKeyConstraintError) {
    const detail = `${error.index ?? ''} ${error.parent?.message ?? error.message}`;

    if (input.bookId !== null && detail.includes('bookId')) {
      throw new NotFoundError('Book', input.bookId);
    }
    if (input.commentId !== null && detail.includes('commentId')) {
      throw new NotFoundError('Comment', input.commentId);
    }
    throw new NotFoundError('User', input.userId);
  }
  throw error;
}

// One like per user per target, enforced by the unique indexes rather than a
// findOne before the insert — that would be a check-then-write race and an
// extra query on every like. Changing one's mind is a PATCH, not a second POST.
function asConflict(error: unknown): never {
  if (error instanceof UniqueConstraintError) {
    throw new ConflictError('like');
  }
  throw error;
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
    async create(input) {
      try {
        const like = await Like.create(input);
        return toPublicLike(like);
      } catch (error) {
        // A unique violation and a missing reference are different answers —
        // 409 for "you already voted", 404 for "that book is not there" — so
        // the two are mapped separately rather than through one catch-all.
        if (error instanceof UniqueConstraintError) asConflict(error);
        asMissingReference(error, input);
      }
    },

    async list(query) {
      // No attributes list, unlike chapterRepository: every column here is a
      // number or a boolean, so there is no large one worth omitting.
      const { rows, count } = await Like.findAndCountAll({
        where: buildWhere(query),
        limit: query.limit,
        offset: query.offset,
        order: [['id', 'ASC']],
      });

      return { items: rows.map(toPublicLike), total: count };
    },

    async findById(id) {
      const like = await Like.findByPk(id);
      return like ? toPublicLike(like) : null;
    },

    async update(id, input) {
      const like = await Like.findByPk(id);
      if (!like) return null;

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
