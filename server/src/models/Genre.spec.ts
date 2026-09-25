import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initModels } from './index.ts';
import { Genre, toPublicGenre } from './Genre.ts';

// Sequelize's query generator is not part of the public typings, so it is
// reached through a narrow structural cast rather than `any` — as in
// Series.spec.ts.
interface QueryGeneratorLike {
  attributesToSQL(attributes: unknown, options: unknown): unknown;
  createTableQuery(
    table: string,
    attributes: unknown,
    options: unknown
  ): string;
}

// Built once rather than per test: initModels declares the associations, and
// Sequelize rejects a second association under the same alias.
const createTableSql = (() => {
  const sequelize = new Sequelize('books_demo_spa', 'user', 'pass', {
    dialect: 'mysql',
    logging: false,
  });
  initModels(sequelize);

  const generator = sequelize.getQueryInterface()
    .queryGenerator as unknown as QueryGeneratorLike;
  const attributes = generator.attributesToSQL(Genre.getAttributes(), {
    table: 'genres',
  });

  return generator.createTableQuery('genres', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('the name is a bounded VARCHAR(50), so it can carry an index', () => {
  assert.match(createTableSql, /`name` VARCHAR\(50\) NOT NULL/);
});

test('the id matches the type books.genreId and series.genreId must use', () => {
  assert.match(createTableSql, /`id` INTEGER UNSIGNED auto_increment/);
});

test('the timestamps are NOT NULL, as every other table declares them', () => {
  assert.match(createTableSql, /`createdAt` DATETIME NOT NULL/);
  assert.match(createTableSql, /`updatedAt` DATETIME NOT NULL/);
});

// The table's default collation is what makes "fantasy" collide with
// "Fantasy" under the unique index, so the collation is part of the rule
// rather than a formatting choice.
test('the table is InnoDB with the case-insensitive utf8mb4 default collation', () => {
  assert.match(
    createTableSql,
    /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_0900_ai_ci/
  );
});

test('the name carries the unique index, not a check-then-write in code', () => {
  assert.deepEqual(
    Genre.options.indexes?.map((index) => ({
      fields: index.fields,
      unique: index.unique,
    })),
    [{ fields: ['name'], unique: true }]
  );
});

test('toPublicGenre answers the id and the name, and nothing else', () => {
  const genre = Genre.build({ id: 3, name: 'Hard SF' });

  assert.deepEqual(toPublicGenre(genre), { id: 3, name: 'Hard SF' });
});
