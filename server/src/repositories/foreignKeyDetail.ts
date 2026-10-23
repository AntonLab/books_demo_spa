import { ForeignKeyConstraintError } from 'sequelize';

// MySQL names the offending column only in this text. Null: not a foreign key error.
export function foreignKeyDetail(error: unknown): string | null {
  if (!(error instanceof ForeignKeyConstraintError)) return null;
  return `${error.index ?? ''} ${error.parent?.message ?? error.message}`;
}
