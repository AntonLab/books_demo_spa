import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initModels } from './index.ts';
import { Series, toPublicSeries } from './Series.ts';

// Sequelize's query generator is not part of the public typings, so it is
// reached through a narrow structural cast rather than `any`.
interface QueryGeneratorLike {
  attributesToSQL(attributes: unknown, options: unknown): unknown;
  createTableQuery(
    table: string,
    attributes: unknown,
    options: unknown
  ): string;
}

// Built once rather than per test: initModels declares the User <-> Series
// association, and Sequelize rejects a second association under the same alias.
const createTableSql = (() => {
  const sequelize = new Sequelize('books_demo_spa', 'user', 'pass', {
    dialect: 'mysql',
    logging: false,
  });
  initModels(sequelize);

  const generator = sequelize.getQueryInterface()
    .queryGenerator as unknown as QueryGeneratorLike;
  const attributes = generator.attributesToSQL(Series.getAttributes(), {
    table: 'series',
  });

  return generator.createTableQuery('series', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('tags is a JSON column, since MySQL has no array type', () => {
  assert.match(createTableSql, /`tags` JSON NOT NULL/);
});

test('tags carries no DDL default — MySQL forbids one on a JSON column', () => {
  assert.doesNotMatch(createTableSql, /`tags` JSON[^,]*DEFAULT/);
});

test('userId matches users.id exactly, or MySQL rejects the foreign key', () => {
  assert.match(createTableSql, /`userId` INTEGER UNSIGNED NOT NULL/);
  assert.match(createTableSql, /`id` INTEGER UNSIGNED auto_increment/);
});

test('the hasMany association emits a cascading foreign key to users', () => {
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`userId`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
});

test('description is TEXT and the timestamps are NOT NULL', () => {
  assert.match(createTableSql, /`description` TEXT NOT NULL/);
  assert.match(createTableSql, /`createdAt` DATETIME NOT NULL/);
  assert.match(createTableSql, /`updatedAt` DATETIME NOT NULL/);
});

test('the table is InnoDB with the utf8mb4 default collation', () => {
  assert.match(
    createTableSql,
    /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_0900_ai_ci/
  );
});

test('(userId, id) is indexed so the list filter and ordering share one index', () => {
  assert.deepEqual(
    Series.options.indexes?.map((index) => index.fields),
    [['userId', 'id']]
  );
});

test('User.hasMany(Series) is registered under the `series` alias', () => {
  const association = Series.associations.user;

  assert.equal(association.associationType, 'BelongsTo');
  assert.equal(association.target.name, 'User');
});

test('toPublicSeries copies the tag array rather than aliasing the model', () => {
  const series = Series.build({
    id: 1,
    userId: 2,
    description: 'A trilogy',
    tags: ['sci-fi'],
  });

  const output = toPublicSeries(series);
  output.tags.push('mutated');

  assert.deepEqual(series.tags, ['sci-fi']);
});

test('toPublicSeries parses a JSON string, should a driver return one raw', () => {
  const series = Series.build({
    id: 1,
    userId: 2,
    description: 'A trilogy',
    tags: ['sci-fi'],
  });
  // A raw string is the shape a non-parsing driver would hand back; without
  // normalisation it would be spread character by character.
  series.setDataValue('tags', '["sci-fi","epic"]' as unknown as string[]);

  assert.deepEqual(toPublicSeries(series).tags, ['sci-fi', 'epic']);
});
