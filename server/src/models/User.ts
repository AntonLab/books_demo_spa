import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import { hashPassword } from '../password.ts';
import type { AuthorSummary, PublicUser, UserStatus, UserRole } from 'shared';
import { USER_STATUSES, USER_ROLES } from 'shared';

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<number>;
  declare login: string;
  declare email: string;
  declare password: string;
  declare firstName: string;
  declare lastName: string;
  declare status: CreationOptional<UserStatus>;
  declare role: CreationOptional<UserRole>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  // No `books` or `series`: an account reaches its works through book_authors
  // and series_authors, not an owner column on either.
}

export function initUserModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      // Sequelize 6 has no per-column collation option, so the type is given as
      // a raw string. utf8mb4_0900_as_cs is case-sensitive, which is what makes
      // `Bob` and `bob` different logins.
      login: {
        type: 'VARCHAR(64) COLLATE utf8mb4_0900_as_cs',
        allowNull: false,
        unique: true,
      },
      // No column collation: email inherits the case-insensitive table default,
      // because addresses are treated case-insensitively in practice.
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      firstName: { type: DataTypes.STRING(64), allowNull: false },
      lastName: { type: DataTypes.STRING(64), allowNull: false },
      status: {
        type: DataTypes.ENUM(...USER_STATUSES),
        allowNull: false,
        defaultValue: 'pending',
      },
      role: {
        type: DataTypes.ENUM(...USER_ROLES),
        allowNull: false,
        defaultValue: 'user',
      },
      // allowNull: false is required explicitly here — Sequelize only applies
      // its own NOT NULL default to createdAt/updatedAt when it auto-injects
      // them; declaring them ourselves (to attach the CreationOptional<Date>
      // type above) opts out of that default unless restated.
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: 'users',
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      // First of two independent guards against leaking the hash.
      defaultScope: { attributes: { exclude: ['password'] } },
    }
  );

  // Guarded by `changed`, or a second save would hash the existing hash.
  // The hook issues no queries, so it has no transaction to forward.
  User.beforeSave(async (user) => {
    if (user.changed('password')) {
      user.password = await hashPassword(user.password);
    }
  });

  return User;
}

// Second guard: defaultScope does not apply to the result of create(), and can
// be bypassed with unscoped(), so the shape is narrowed explicitly.
export function toPublicUser(user: User, avatarUrl: string | null): PublicUser {
  return {
    id: user.id,
    login: user.login,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    role: user.role,
    avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// The shape public endpoints embed when they name an author. Deliberately not
// derived from toPublicUser with a delete: an author summary that grew a field
// because PublicUser did is exactly the leak this exists to prevent.
export function toAuthorSummary(
  user: User,
  avatarUrl: string | null
): AuthorSummary {
  return {
    id: user.id,
    login: user.login,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl,
  };
}
