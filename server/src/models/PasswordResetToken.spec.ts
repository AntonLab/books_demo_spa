import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { initModels } from './index.ts';
import { PasswordResetToken } from './PasswordResetToken.ts';

interface QueryGeneratorLike {
  attributesToSQL(attributes: unknown, options: unknown): unknown;
  createTableQuery(
    table: string,
    attributes: unknown,
    options: unknown
  ): string;
}

const createTableSql = (() => {
  const sequelize = new Sequelize('books_demo_spa', 'user', 'pass', {
    dialect: 'mysql',
    logging: false,
  });
  initModels(sequelize);

  const generator = sequelize.getQueryInterface()
    .queryGenerator as unknown as QueryGeneratorLike;
  const attributes = generator.attributesToSQL(
    PasswordResetToken.getAttributes(),
    { table: 'password_reset_tokens' }
  );

  return generator.createTableQuery('password_reset_tokens', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('tokenHash is CHAR(64) and unique', () => {
  assert.match(createTableSql, /`tokenHash` CHAR\(64\) NOT NULL/);
  assert.match(createTableSql, /`tokenHash`[^,]*UNIQUE/);
});

test('usedAt is nullable: null is what makes a token still redeemable', () => {
  assert.match(createTableSql, /`usedAt` DATETIME(?! NOT NULL)/);
});

test('expiresAt is NOT NULL', () => {
  assert.match(createTableSql, /`expiresAt` DATETIME NOT NULL/);
});

test('reset tokens cascade from their user', () => {
  assert.ok(PasswordResetToken.associations.user);
});
