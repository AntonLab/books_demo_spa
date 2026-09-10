import { Permission, toPublicPermission } from '../models/Permission.ts';
import { buildMatrixRows } from './matrix.ts';
import type {
  Action,
  Module,
  PermissionScope,
  PublicPermission,
  Role,
} from '../types/permission.ts';

// The matrix is derived from code and never changes at runtime, so it is read
// once rather than on every request. Changing permissions means editing the
// definition and restarting — which recreating the table already requires.
let matrix = new Map<string, PermissionScope>();

const key = (role: Role, module: Module, action: Action): string =>
  `${role}/${module}/${action}`;

// Exported for tests, which need a matrix without a database behind it.
export function loadMatrix(rows: PublicPermission[]): void {
  matrix = new Map(
    rows.map((row) => [key(row.role, row.module, row.action), row.scope])
  );
}

// Replaces the table wholesale rather than upserting row by row: a partial
// upsert leaves orphan rows for modules the code no longer has, and those read
// as grants nobody wrote.
export async function syncPermissions(): Promise<void> {
  const sequelize = Permission.sequelize;
  if (!sequelize) throw new Error('Permission model is not initialised');

  const rows = buildMatrixRows();

  await sequelize.transaction(async (transaction) => {
    await Permission.destroy({ where: {}, truncate: false, transaction });
    await Permission.bulkCreate(rows, { transaction });
  });

  const stored = await Permission.findAll();
  loadMatrix(stored.map(toPublicPermission));
}

// Anything not in the matrix is `none`. A missing row is a denial, never an
// accident that opens a door.
export function scopeFor(
  role: Role,
  module: Module,
  action: Action
): PermissionScope {
  return matrix.get(key(role, module, action)) ?? 'none';
}
