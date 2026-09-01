import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import { hashPassword } from '../password.ts';
import {
  USER_STATUSES,
  type PublicUser,
  type UserStatus,
} from '../types/user.ts';

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
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
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
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    login: user.login,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
