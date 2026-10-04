import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import type { Book } from './Book.ts';
import type { Comment } from './Comment.ts';
import type { User } from './User.ts';
import type { PublicLike } from 'shared';

export class Like extends Model<
  InferAttributes<Like>,
  InferCreationAttributes<Like>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  // Both targets are nullable and creation-optional, like books.seriesId and
  // unlike chapters.bookId — but for a different reason. There they express
  // "this link is optional"; here exactly one of the two is always filled, and
  // nullability is simply what makes that expressible in two columns. The
  // invariant itself lives in the validator below.
  declare bookId: CreationOptional<ForeignKey<Book['id']> | null>;
  declare commentId: CreationOptional<ForeignKey<Comment['id']> | null>;
  declare isLike: boolean;
  // No updatedAt: the table keeps createdAt alone, so `timestamps: true` is
  // paired with `updatedAt: false` below.
  declare createdAt: CreationOptional<Date>;

  // Populated only by an eager `include`; NonAttribute keeps them out of the
  // inferred attribute set so they are never mistaken for columns.
  declare user?: NonAttribute<User>;
  declare book?: NonAttribute<Book>;
  declare comment?: NonAttribute<Comment>;
}

// The XOR, restated where Sequelize can enforce it: createLikeSchema covers the
// API edge, but a caller reaching the model skips zod, and MySQL gets no CHECK
// (Sequelize 6 cannot declare one in Model.init and there is no migration tool;
// see .claude/rules/server/sequelize.md). So this validator is the last line,
// and a write that bypasses the model can still break the invariant.
//
// A named function with an explicit `this`: a method in the options object
// would leave `this` implicitly any under strict mode.
function exactlyOneTarget(this: Like): void {
  if ((this.bookId == null) === (this.commentId == null)) {
    throw new Error('Exactly one of bookId or commentId must be set');
  }
}

export function initLikeModel(sequelize: Sequelize): typeof Like {
  Like.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // INTEGER UNSIGNED to match users.id / books.id / comments.id (errno
      // 3780 otherwise).
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      bookId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      commentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      // TINYINT(1) under MySQL. NOT NULL and undefaulted: a row is a like or a
      // dislike, and there is no third state to leave unset.
      isLike: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      // allowNull: false restated (see User.ts).
      createdAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'likes',
      timestamps: true,
      // The model carries createdAt alone, so Sequelize must be told not to
      // add the updatedAt column it maintains by default.
      updatedAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      validate: { exactlyOneTarget },
      indexes: [
        // Four indexes, each doing two jobs — likes are the most write-heavy
        // table here, and every extra index is paid on each insert.
        //
        // The first pair serves `?bookId=` / `?commentId=` with ORDER BY id (no
        // filesort) and doubles as the FK indexes.
        { name: 'likes_book_id_id', fields: ['bookId', 'id'] },
        { name: 'likes_comment_id_id', fields: ['commentId', 'id'] },
        // The second pair is the uniqueness the repository relies on instead
        // of a findOne first: one like per user per target. NULLs are distinct
        // in a unique index, so a comment like (bookId IS NULL) sits outside
        // the first constraint and a book like outside the second. Both also
        // index userId, hence no separate (userId, id): `?userId=` filesorts
        // one user's own rows.
        {
          name: 'likes_user_id_book_id',
          fields: ['userId', 'bookId'],
          unique: true,
        },
        {
          name: 'likes_user_id_comment_id',
          fields: ['userId', 'commentId'],
          unique: true,
        },
      ],
    }
  );

  return Like;
}

export function toPublicLike(like: Like): PublicLike {
  return {
    id: like.id,
    userId: like.userId,
    // Normalised the way toPublicBook normalises seriesId: an unset optional
    // foreign key is undefined on a freshly built instance, and the API
    // contract promises null.
    bookId: like.bookId ?? null,
    commentId: like.commentId ?? null,
    isLike: like.isLike,
    createdAt: like.createdAt,
  };
}
