import test from 'node:test';
import assert from 'node:assert/strict';
import { Sequelize } from 'sequelize';
import { Book } from './Book.ts';
import { Favorite, toPublicFavorite } from './Favorite.ts';
import { initModels } from './index.ts';
import { Series } from './Series.ts';
import { User } from './User.ts';

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
  const attributes = generator.attributesToSQL(Favorite.getAttributes(), {
    table: 'favorites',
  });

  return generator.createTableQuery('favorites', attributes, {
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    engine: 'InnoDB',
  });
})();

test('the holder is a NOT NULL INTEGER UNSIGNED, matching users.id', () => {
  assert.match(createTableSql, /`userId` INTEGER UNSIGNED NOT NULL/);
});

test('both targets are nullable, because a favorite fills exactly one', () => {
  assert.match(createTableSql, /`bookId` INTEGER UNSIGNED,/);
  assert.match(createTableSql, /`seriesId` INTEGER UNSIGNED,/);
});

test('createdAt is NOT NULL, and there is no updatedAt column', () => {
  assert.match(createTableSql, /`createdAt` DATETIME NOT NULL/);
  assert.doesNotMatch(createTableSql, /updatedAt/);
});

test('all three foreign keys cascade — SET NULL would break the XOR', () => {
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`userId`\) REFERENCES `users` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`bookId`\) REFERENCES `books` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
  assert.match(
    createTableSql,
    /FOREIGN KEY \(`seriesId`\) REFERENCES `series` \(`id`\) ON DELETE CASCADE ON UPDATE CASCADE/
  );
});

test('the table is InnoDB with the utf8mb4 default collation', () => {
  assert.match(
    createTableSql,
    /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_0900_ai_ci/
  );
});

test('one index per target for the counts, one unique pair per holder', () => {
  assert.deepEqual(
    Favorite.options.indexes?.map((index) => [
      index.fields,
      index.unique === true,
    ]),
    [
      [['bookId'], false],
      [['seriesId'], false],
      [['userId', 'bookId'], true],
      [['userId', 'seriesId'], true],
    ]
  );
});

test('Favorite belongs to a User, a Book and a Series, and each has many', () => {
  assert.equal(Favorite.associations.user?.associationType, 'BelongsTo');
  assert.equal(Favorite.associations.book?.associationType, 'BelongsTo');
  assert.equal(Favorite.associations.series?.associationType, 'BelongsTo');
  assert.equal(User.associations.favorites?.target.name, 'Favorite');
  assert.equal(Book.associations.favorites?.target.name, 'Favorite');
  assert.equal(Series.associations.favorites?.target.name, 'Favorite');
});

test('toPublicFavorite normalises an unset target to null', () => {
  const createdAt = new Date('2026-01-02T03:04:05Z');
  const favorite = Favorite.build({ id: 1, userId: 2, seriesId: 3, createdAt });

  assert.deepEqual(toPublicFavorite(favorite), {
    id: 1,
    userId: 2,
    bookId: null,
    seriesId: 3,
    createdAt,
  });
});

test('a favorite naming both targets fails validation', async () => {
  const favorite = Favorite.build({
    userId: 1,
    bookId: 2,
    seriesId: 3,
    createdAt: new Date(),
  });

  await assert.rejects(
    () => favorite.validate(),
    /Exactly one of bookId or seriesId/
  );
});

test('a favorite naming neither target fails validation', async () => {
  const favorite = Favorite.build({ userId: 1, createdAt: new Date() });

  await assert.rejects(
    () => favorite.validate(),
    /Exactly one of bookId or seriesId/
  );
});

test('a favorite naming exactly one target validates', async () => {
  const favorite = Favorite.build({
    userId: 1,
    bookId: 2,
    createdAt: new Date(),
  });

  await assert.doesNotReject(() => favorite.validate());
});
