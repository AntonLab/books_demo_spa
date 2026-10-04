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
      // INTEGER UNSIGNED to match users.id (errno 3780 otherwise).
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      // CHAR, not VARCHAR: a SHA-256 hex digest is always exactly 64
      // characters, so the fixed width is free and the column self-documents.
      // The plaintext token is never stored — it exists only in the cookie.
      tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      // allowNull: false restated (see User.ts).
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
        // Serves deleteAllForUser and deleteExpired, and doubles as the FK
        // index.
        {
          name: 'sessions_user_id_expires_at',
          fields: ['userId', 'expiresAt'],
        },
      ],
    }
  );

  return Session;
}
