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
import type { User } from './User.ts';
import type { PublicComment } from '../types/comment.ts';

export class Comment extends Model<
  InferAttributes<Comment>,
  InferCreationAttributes<Comment>
> {
  declare id: CreationOptional<number>;
  // Nullable and creation-optional, like books.seriesId and unlike
  // chapters.bookId: a top-level comment replies to nothing. The self-reference
  // is what makes the thread a tree.
  declare parentId: CreationOptional<ForeignKey<Comment['id']> | null>;
  declare userId: ForeignKey<User['id']>;
  declare bookId: ForeignKey<Book['id']>;
  declare text: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Populated only by an eager `include`; NonAttribute keeps them out of the
  // inferred attribute set so they are never mistaken for columns.
  declare user?: NonAttribute<User>;
  declare book?: NonAttribute<Book>;
  declare parent?: NonAttribute<Comment>;
  declare replies?: NonAttribute<Comment[]>;
}

export function initCommentModel(sequelize: Sequelize): typeof Comment {
  Comment.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // Points back at this table's own id, so it matches by construction —
      // but it is still spelled out, because a mismatch here fails the same
      // way a mismatch against users.id or books.id would (errno 3780).
      // allowNull is what makes the association's ON DELETE SET NULL legal.
      parentId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      // Must match users.id / books.id exactly (INTEGER UNSIGNED) or MySQL
      // rejects the foreign key with errno 3780 on incompatible column types.
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      bookId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      // TEXT, not the MEDIUMTEXT a chapter body needs: a comment is short by
      // nature, like the descriptions on series and books, and TEXT's 65,535
      // bytes leave ~16k characters even in the worst utf8mb4 case.
      text: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // See User.ts: declaring the timestamps ourselves opts out of Sequelize's
      // implicit NOT NULL, so it is restated here.
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'comments',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // Each serves its `?bookId=` / `?userId=` / `?parentId=` filter
        // together with a list endpoint's `ORDER BY id`, so none needs a
        // filesort. All three are also a leftmost prefix of their foreign
        // key's column, so InnoDB reuses them instead of creating a second
        // index per constraint. The parent one carries the extra weight here:
        // fetching one comment's replies is the read a thread view repeats.
        { name: 'comments_book_id_id', fields: ['bookId', 'id'] },
        { name: 'comments_user_id_id', fields: ['userId', 'id'] },
        { name: 'comments_parent_id_id', fields: ['parentId', 'id'] },
      ],
    }
  );

  return Comment;
}

export function toPublicComment(comment: Comment): PublicComment {
  return {
    id: comment.id,
    // Normalised the way toPublicBook normalises seriesId: an unset optional
    // foreign key is undefined on a freshly built instance, and the API
    // contract promises null.
    parentId: comment.parentId ?? null,
    userId: comment.userId,
    bookId: comment.bookId,
    text: comment.text,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}
