import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import {
  ACTIONS,
  MODULES,
  PERMISSION_SCOPES,
  ROLES,
  type Action,
  type Module,
  type PermissionScope,
  type PublicPermission,
  type Role,
} from '../types/permission.ts';

export class Permission extends Model<
  InferAttributes<Permission>,
  InferCreationAttributes<Permission>
> {
  declare id: CreationOptional<number>;
  declare role: Role;
  declare module: Module;
  declare action: Action;
  declare scope: PermissionScope;
}

export function initPermissionModel(sequelize: Sequelize): typeof Permission {
  Permission.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      role: { type: DataTypes.ENUM(...ROLES), allowNull: false },
      module: { type: DataTypes.ENUM(...MODULES), allowNull: false },
      action: { type: DataTypes.ENUM(...ACTIONS), allowNull: false },
      scope: { type: DataTypes.ENUM(...PERMISSION_SCOPES), allowNull: false },
    },
    {
      sequelize,
      tableName: 'permissions',
      // No timestamps: a row is seeded from code and replaced wholesale, so
      // when it was written says nothing anyone would ask.
      timestamps: false,
      charset: 'utf8mb4',
      collate: 'utf8mb4_0900_ai_ci',
      indexes: [
        // The lookup is always all three together, and the uniqueness is what
        // makes a duplicated seed row impossible rather than merely unlikely.
        {
          name: 'permissions_role_module_action',
          unique: true,
          fields: ['role', 'module', 'action'],
        },
      ],
    }
  );

  return Permission;
}

export function toPublicPermission(row: Permission): PublicPermission {
  return {
    role: row.role,
    module: row.module,
    action: row.action,
    scope: row.scope,
  };
}
