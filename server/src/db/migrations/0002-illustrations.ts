import type { QueryInterface } from 'sequelize';

const TABLES = [
  `CREATE TABLE \`illustrations\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`chapterId\` int unsigned NOT NULL,
  \`position\` int unsigned NOT NULL,
  \`caption\` varchar(200) DEFAULT NULL,
  \`createdAt\` datetime NOT NULL,
  \`updatedAt\` datetime(3) NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`illustrations_chapter_id_position\` (\`chapterId\`,\`position\`),
  CONSTRAINT \`illustrations_ibfk_1\` FOREIGN KEY (\`chapterId\`) REFERENCES \`chapters\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  `CREATE TABLE \`illustration_images\` (
  \`illustrationId\` int unsigned NOT NULL,
  \`data\` mediumblob NOT NULL,
  \`updatedAt\` datetime(3) NOT NULL,
  PRIMARY KEY (\`illustrationId\`),
  CONSTRAINT \`illustration_images_ibfk_1\` FOREIGN KEY (\`illustrationId\`) REFERENCES \`illustrations\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
];

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const sql of TABLES) {
    await queryInterface.sequelize.query(sql);
  }
}
