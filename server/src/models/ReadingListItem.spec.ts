import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initModels } from './index.ts';
import { ReadingListItem } from './ReadingListItem.ts';

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

// Built once: initModels declares the associations, and Sequelize rejects a
// second association under the same alias.
const createTableSql = (() => {
  const sequelize = new Sequelize('books_demo_spa', 'user', 'pass', {
    dialect: 'mysql',
    logging: false,
  });
  initModels(sequelize);

  const generator = sequelize.getQueryInterface()
    .queryGenerator as unknown as QueryGeneratorLike;
  const attributes = generator.attributesToSQL(
    ReadingListItem.getAttributes(),
    { table: 'reading_list_items' }
  );

  return generator.createTableQuery('reading_list_items', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('all three foreign keys cascade', () => {
  for (const column of ['listId', 'bookId', 'seriesId']) {
    assert.match(
      createTableSql,
      new RegExp(
        `FOREIGN KEY \\(\`${column}\`\\) .* ON DELETE CASCADE ON UPDATE CASCADE`
      )
    );
  }
});

test('a work appears once per list: one unique index per target', () => {
  const unique = ReadingListItem.options.indexes
    ?.filter((index) => index.unique === true)
    .map((index) => [index.name, index.fields]);

  assert.deepEqual(unique, [
    ['reading_list_items_list_id_book_id', ['listId', 'bookId']],
    ['reading_list_items_list_id_series_id', ['listId', 'seriesId']],
  ]);
});

test('position is NOT NULL and indexed with the list for ordered reads', () => {
  assert.match(createTableSql, /`position` INTEGER UNSIGNED NOT NULL/);
  assert.ok(
    ReadingListItem.options.indexes?.some(
      (index) =>
        index.name === 'reading_list_items_list_id_position' &&
        index.fields?.join() === 'listId,position'
    )
  );
});

test('an item has no timestamps', () => {
  assert.doesNotMatch(createTableSql, /createdAt|updatedAt/);
});

test('exactly one of bookId and seriesId passes validation', async () => {
  await assert.rejects(
    ReadingListItem.build({ listId: 1, position: 1 }).validate()
  );
  await assert.rejects(
    ReadingListItem.build({
      listId: 1,
      position: 1,
      bookId: 1,
      seriesId: 1,
    }).validate()
  );
  await ReadingListItem.build({ listId: 1, position: 1, bookId: 1 }).validate();
  await ReadingListItem.build({
    listId: 1,
    position: 1,
    seriesId: 1,
  }).validate();
});
