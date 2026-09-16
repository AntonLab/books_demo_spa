import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { User } from './User.ts';

// An Account's Avatar (CONTEXT.md, ADR-0007), whatever its Role — the same
// shape as BookCover.ts, keyed by the account instead of the book.
export class UserAvatar extends Model<
  InferAttributes<UserAvatar>,
  InferCreationAttributes<UserAvatar>
> {
  declare userId: ForeignKey<User['id']>;
  declare data: Buffer;
  declare updatedAt: CreationOptional<Date>;
}

export function initUserAvatarModel(sequelize: Sequelize): typeof UserAvatar {
  UserAvatar.init(
    {
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
      },
      data: {
        type: DataTypes.BLOB('medium'),
        allowNull: false,
      },
      updatedAt: { type: DataTypes.DATE(3), allowNull: false },
    },
    {
      sequelize,
      tableName: 'user_avatars',
      timestamps: true,
      createdAt: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
    }
  );

  return UserAvatar;
}
