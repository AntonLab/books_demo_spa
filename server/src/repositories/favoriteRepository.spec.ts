process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import { initModels } from '../models/index.ts';
import { Book } from '../models/Book.ts';
import { Favorite } from '../models/Favorite.ts';
import { Series } from '../models/Series.ts';
import { User } from '../models/User.ts';
import {
  createCreditedBook,
  createCreditedSeries,
} from '../models/creditedBook.testkit.ts';
import { NotFoundError } from '../types/errors.ts';
import {
  createSequelizeFavoriteRepository,
  type Account,
} from './favoriteRepository.ts';
import { favoriteRepositoryContract } from './favoriteRepository.contract.testkit.ts';

// A schema of its own: node:test runs spec files in parallel processes, and
// two suites calling sync({ force: true }) on one database drop each other's
// tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_favorites`;

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
  });
  return config.db;
}

const skip = await skipWithoutMysql();

const FIRST_PAGE = { limit: 20, offset: 0 };

let accountCount = 0;
async function anAccount(role: 'user' | 'author' | 'admin' = 'user') {
  accountCount += 1;
  return User.create({
    login: `FavoriteHolder${accountCount}`,
    email: `favorite-holder-${accountCount}@example.com`,
    password: 'hunter2hunter2',
    firstName: 'Fay',
    lastName: `Holder${accountCount}`,
    role,
  });
}

const as = (user: User): Account => ({ id: user.id, role: user.role });

describe('favoriteRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const repository = createSequelizeFavoriteRepository();

  before(async () => {
    const db = testDbConfig();
    await ensureDatabase(db);
    sequelize = createSequelize(db);
    initModels(sequelize);
    await sequelize.sync({ force: true });
  });

  after(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    // Children first: the foreign keys forbid clearing parents out from under
    // them.
    await Favorite.destroy({ where: {}, truncate: false });
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
  });

  test('a Draft book is the same 404 as a missing one to a reader', async () => {
    const author = await anAccount('author');
    const reader = await anAccount();
    const draft = await createCreditedBook(
      { title: 'Unfinished', description: 'x', tags: [], status: 'draft' },
      [author.id]
    );

    await assert.rejects(
      repository.create({ bookId: draft.id, seriesId: null }, as(reader)),
      new NotFoundError('Book', draft.id)
    );
    assert.equal(await Favorite.count(), 0);
  });

  test('its Co-author and a Moderator may favorite a Draft book they can read', async () => {
    const author = await anAccount('author');
    const moderator = await anAccount('admin');
    const draft = await createCreditedBook(
      { title: 'Unfinished', description: 'x', tags: [], status: 'draft' },
      [author.id]
    );

    const byAuthor = await repository.create(
      { bookId: draft.id, seriesId: null },
      as(author)
    );
    const byModerator = await repository.create(
      { bookId: draft.id, seriesId: null },
      as(moderator)
    );

    assert.equal(byAuthor.bookId, draft.id);
    assert.equal(byModerator.bookId, draft.id);
  });

  test('a series holding only Draft books is the same 404 as a missing one to a reader', async () => {
    const author = await anAccount('author');
    const reader = await anAccount();
    const series = await createCreditedSeries(
      { title: 'Hidden Saga', description: 'x', tags: [] },
      [author.id]
    );
    await createCreditedBook(
      {
        title: 'Hidden One',
        description: 'x',
        tags: [],
        status: 'draft',
        seriesId: series.id,
      },
      [author.id]
    );

    await assert.rejects(
      repository.create({ bookId: null, seriesId: series.id }, as(reader)),
      new NotFoundError('Series', series.id)
    );
    assert.equal(
      (
        await repository.create(
          { bookId: null, seriesId: series.id },
          as(author)
        )
      ).seriesId,
      series.id
    );
  });

  test('a book returned to Draft leaves the list and its total, and comes back on republish', async () => {
    const author = await anAccount('author');
    const reader = await anAccount();
    const kept = await createCreditedBook(
      { title: 'Still Out', description: 'x', tags: [] },
      [author.id]
    );
    const withdrawn = await createCreditedBook(
      { title: 'Pulled Back', description: 'x', tags: [] },
      [author.id]
    );
    await repository.create({ bookId: kept.id, seriesId: null }, as(reader));
    await repository.create(
      { bookId: withdrawn.id, seriesId: null },
      as(reader)
    );

    await withdrawn.update({ status: 'draft' });
    const hidden = await repository.listBooks(FIRST_PAGE, as(reader));

    assert.equal(hidden.total, 1);
    assert.deepEqual(
      hidden.items.map((item) => item.book.id),
      [kept.id]
    );
    assert.equal(await Favorite.count(), 2);

    await withdrawn.update({ status: 'complete' });
    const back = await repository.listBooks(FIRST_PAGE, as(reader));

    assert.equal(back.total, 2);
  });

  test("even a Co-author's own Draft book stays out of their Favorites list", async () => {
    const author = await anAccount('author');
    const draft = await createCreditedBook(
      { title: 'Mine', description: 'x', tags: [], status: 'draft' },
      [author.id]
    );
    await repository.create({ bookId: draft.id, seriesId: null }, as(author));

    assert.deepEqual(await repository.listBooks(FIRST_PAGE, as(author)), {
      items: [],
      total: 0,
    });
  });

  test('a list row embeds the book with its Co-authors, as the catalogue shows it', async () => {
    const author = await anAccount('author');
    const reader = await anAccount();
    const book = await createCreditedBook(
      { title: 'Embedded', description: 'x', tags: ['epic'] },
      [author.id]
    );
    await repository.create({ bookId: book.id, seriesId: null }, as(reader));

    const [row] = (await repository.listBooks(FIRST_PAGE, as(reader))).items;

    assert.equal(row?.book.title, 'Embedded');
    assert.deepEqual(row?.book.tags, ['epic']);
    assert.deepEqual(
      row?.book.authors.map((summary) => summary.id),
      [author.id]
    );
  });

  test('a series whose last published book returns to Draft leaves the series list', async () => {
    const author = await anAccount('author');
    const reader = await anAccount();
    const series = await createCreditedSeries(
      { title: 'Fading Saga', description: 'x', tags: [] },
      [author.id]
    );
    const only = await createCreditedBook(
      { title: 'Only One', description: 'x', tags: [], seriesId: series.id },
      [author.id]
    );
    await repository.create({ bookId: null, seriesId: series.id }, as(reader));

    await only.update({ status: 'draft' });

    assert.equal(
      (await repository.listSeries(FIRST_PAGE, as(reader))).total,
      0
    );
  });

  test('deleting a book or an account takes its favorites with it', async () => {
    const author = await anAccount('author');
    const reader = await anAccount();
    const book = await createCreditedBook(
      { title: 'Gone Soon', description: 'x', tags: [] },
      [author.id]
    );
    const other = await createCreditedBook(
      { title: 'Still Here', description: 'x', tags: [] },
      [author.id]
    );
    await repository.create({ bookId: book.id, seriesId: null }, as(reader));
    await repository.create({ bookId: other.id, seriesId: null }, as(reader));

    await book.destroy();
    assert.equal(await Favorite.count(), 1);

    await reader.destroy();
    assert.equal(await Favorite.count(), 0);
  });

  // --- The contract the route specs' fake is held to, run here for real. ---

  favoriteRepositoryContract(async () => ({
    repository,
    async anAccount() {
      return (await anAccount()).id;
    },
    async aBook(coAuthorIds) {
      const book = await createCreditedBook(
        { title: 'Contract Book', description: 'x', tags: [] },
        coAuthorIds
      );
      return book.id;
    },
    async aSeries(coAuthorIds) {
      const series = await createCreditedSeries(
        { title: 'Contract Series', description: 'x', tags: [] },
        coAuthorIds
      );
      await createCreditedBook(
        {
          title: 'Contract Series Book',
          description: 'x',
          tags: [],
          seriesId: series.id,
        },
        coAuthorIds
      );
      return series.id;
    },
  }));
});
