import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initModels } from './index.ts';
import { Report } from './Report.ts';

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
  const attributes = generator.attributesToSQL(Report.getAttributes(), {
    table: 'reports',
  });

  return generator.createTableQuery('reports', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('the Comment cascades; every Account reference is set null', () => {
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`commentId`\) .* ON DELETE CASCADE ON UPDATE CASCADE/
  );
  for (const column of ['reporterId', 'reportedAccountId', 'moderatorId']) {
    assert.match(
      createTableSql,
      new RegExp(
        `FOREIGN KEY \\(\`${column}\`\\) .* ON DELETE SET NULL ON UPDATE CASCADE`
      )
    );
  }
});

test('one Report per Comment and reporter: the single unique index', () => {
  const unique = Report.options.indexes
    ?.filter((index) => index.unique === true)
    .map((index) => [index.name, index.fields]);
  assert.deepEqual(unique, [
    ['reports_comment_id_reporter_id', ['commentId', 'reporterId']],
  ]);
});
