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

export class Session extends Model<
  InferAttributes<Session>,
  InferCreationAttributes<Session>
> {
  declare id: CreationOptional<number>;
  // Not nullable and not creation-optional: a session with no user is
  // meaningless.
  declare userId: ForeignKey<User['id']>;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;
}

export function initSessionModel(sequelize: Sequelize): typeof Session {
  Session.init(
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
      // The plaintext token is never stored — it exists only in the cookie.
      tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      // See User.ts: declaring the timestamps ourselves opts out of
      // Sequelize's implicit NOT NULL, so it is restated here.
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'sessions',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // Serves deleteAllForUser and the expiry sweep a later spec will add.
        // It is also a leftmost prefix of the foreign key's column, so InnoDB
        // reuses it instead of creating a second index for the constraint.
        {
          name: 'sessions_user_id_expires_at',
          fields: ['userId', 'expiresAt'],
        },
      ],
    }
  );

  return Session;
}
