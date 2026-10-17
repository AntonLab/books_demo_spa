import type { QueryInterface } from 'sequelize';

// A row targets exactly one of its two target columns. Sequelize 6 cannot
// declare a CHECK, so the model validators and zod refinements guard the API
// and this guards raw SQL.
//
// MySQL refuses a CHECK on a column that a foreign key's ON UPDATE action
// names, so each target FK is re-added with ON UPDATE RESTRICT instead of
// CASCADE (ids never change, so nothing is lost). ON DELETE CASCADE stays.
const STATEMENTS = [
  'ALTER TABLE `likes` DROP FOREIGN KEY `likes_ibfk_2`, DROP FOREIGN KEY `likes_ibfk_3`',
  'ALTER TABLE `likes` ADD CONSTRAINT `likes_ibfk_2` FOREIGN KEY (`bookId`) REFERENCES `books` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT, ADD CONSTRAINT `likes_ibfk_3` FOREIGN KEY (`commentId`) REFERENCES `comments` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT, ADD CONSTRAINT `likes_exactly_one_target` CHECK ((`bookId` IS NULL) <> (`commentId` IS NULL))',
  'ALTER TABLE `favorites` DROP FOREIGN KEY `favorites_ibfk_2`, DROP FOREIGN KEY `favorites_ibfk_3`',
  'ALTER TABLE `favorites` ADD CONSTRAINT `favorites_ibfk_2` FOREIGN KEY (`bookId`) REFERENCES `books` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT, ADD CONSTRAINT `favorites_ibfk_3` FOREIGN KEY (`seriesId`) REFERENCES `series` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT, ADD CONSTRAINT `favorites_exactly_one_target` CHECK ((`bookId` IS NULL) <> (`seriesId` IS NULL))',
];

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const sql of STATEMENTS) {
    await queryInterface.sequelize.query(sql);
  }
}
