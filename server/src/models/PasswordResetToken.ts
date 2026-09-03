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
import type { User } from './User.ts';

export class PasswordResetToken extends Model<
  InferAttributes<PasswordResetToken>,
  InferCreationAttributes<PasswordResetToken>
> {
  declare id: CreationOptional<number>;
  // Not nullable and not creation-optional: a reset token with no user is
  // meaningless.
  declare userId: ForeignKey<User['id']>;
  declare tokenHash: string;
  declare expiresAt: Date;
  // Null means redeemable. Stamping it is what makes a token single-use, so
  // this column is the whole reuse defence.
  declare usedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;
}

export function initPasswordResetTokenModel(
  sequelize: Sequelize
): typeof PasswordResetToken {
  PasswordResetToken.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // Must match users.id exactly (INTEGER UNSIGNED) or MySQL rejects the
      // foreign key with errno 3780 on incompatible column types.
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      // CHAR, not VARCHAR: a SHA-256 hex digest is always exactly 64
      // characters, so the fixed width is free and the column self-documents.
      // The plaintext token is never stored — it exists only in the emailed
      // link.
      tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      // Null means redeemable. Stamping it is what makes a token single-use,
      // so this column is the whole reuse defence.
      usedAt: { type: DataTypes.DATE, allowNull: true },
      // See User.ts: declaring the timestamps ourselves opts out of
      // Sequelize's implicit NOT NULL, so it is restated here.
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'password_reset_tokens',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // Serves lookups of a user's reset tokens, and doubles as the index
        // InnoDB needs for the foreign key, so no second index is created for
        // the constraint.
        { name: 'password_reset_tokens_user_id', fields: ['userId'] },
      ],
    }
  );

  return PasswordResetToken;
}
