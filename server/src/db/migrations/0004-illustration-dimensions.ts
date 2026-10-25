import type { QueryInterface } from 'sequelize';

// Stored size of the re-encoded picture, so the client can reserve its box
// before the bytes arrive. Nullable: rows from before this migration are not
// backfilled (that would mean decoding every stored image).
const STATEMENTS = [
  'ALTER TABLE `illustrations` ADD COLUMN `width` int unsigned DEFAULT NULL AFTER `caption`, ADD COLUMN `height` int unsigned DEFAULT NULL AFTER `width`',
];

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const sql of STATEMENTS) {
    await queryInterface.sequelize.query(sql);
  }
}
