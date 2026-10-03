process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { UniqueConstraintError, type Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import { initModels } from '../models/index.ts';
import { Book } from '../models/Book.ts';
import { LibraryEntry } from '../models/LibraryEntry.ts';
import { User } from '../models/User.ts';
import { createCreditedBook } from '../models/creditedBook.testkit.ts';
import {
  createSequelizeLibraryRepository,
  type Account,
} from './libraryRepository.ts';
import { libraryRepositoryContract } from './libraryRepository.contract.testkit.ts';

// A schema of its own: node:test runs spec files in parallel processes, and
// two suites calling sync({ force: true }) on one database drop each other's
// tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_library`;

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
  });
  return config.db;
}

const skip = await skipWithoutMysql();

let accountCount = 0;
async function anAccount(role: 'user' | 'author' | 'admin' = 'user') {
  accountCount += 1;
  return User.create({
    login: `LibraryHolder${accountCount}`,
    email: `library-holder-${accountCount}@example.com`,
    password: 'hunter2hunter2',
    firstName: 'Lia',
    lastName: `Holder${accountCount}`,
    role,
  });
}

const as = (user: User): Account => ({ id: user.id, role: user.role });

describe('libraryRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const repository = createSequelizeLibraryRepository();

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
    await LibraryEntry.destroy({ where: {}, truncate: false });
    await Book.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
  });

  async function arrangeBooks() {
    const me = await anAccount();
    const author = await anAccount('author');
    const moderator = await anAccount('admin');
    const book = await createCreditedBook(
      { title: 'First', description: 'x', tags: [] },
      [author.id]
    );
    const other = await createCreditedBook(
      { title: 'Second', description: 'x', tags: [] },
      [author.id]
    );
    const draft = await createCreditedBook(
      { title: 'Unfinished', description: 'x', tags: [], status: 'draft' },
      [author.id]
    );
    return { me, author, moderator, book, other, draft };
  }

  test('the unique index refuses a second row for one Account and Book', async () => {
    const { me, book } = await arrangeBooks();
    await LibraryEntry.create({
      userId: me.id,
      bookId: book.id,
      status: 'read',
    });
    await assert.rejects(
      LibraryEntry.create({
        userId: me.id,
        bookId: book.id,
        status: 'reading',
      }),
      UniqueConstraintError
    );
  });

  test('deleting the Book, then the Account, deletes the statuses', async () => {
    const { me, book, other } = await arrangeBooks();
    await LibraryEntry.create({
      userId: me.id,
      bookId: book.id,
      status: 'read',
    });
    await LibraryEntry.create({
      userId: me.id,
      bookId: other.id,
      status: 'reading',
    });
    await Book.destroy({ where: { id: book.id } });
    assert.equal(await LibraryEntry.count(), 1);
    await User.destroy({ where: { id: me.id } });
    assert.equal(await LibraryEntry.count(), 0);
  });

  test('a Moderator may set a status on a Draft Book', async () => {
    const { moderator, draft } = await arrangeBooks();
    const entry = await repository.set(draft.id, 'plan_to_read', as(moderator));
    assert.equal(entry.status, 'plan_to_read');
  });

  // --- The contract the route specs' fake is held to, run here for real. ---

  libraryRepositoryContract(async () => ({
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
    async aDraftBook(coAuthorIds) {
      const book = await createCreditedBook(
        {
          title: 'Contract Draft',
          description: 'x',
          tags: [],
          status: 'draft',
        },
        coAuthorIds
      );
      return book.id;
    },
    async setDraft(bookId, draft) {
      await Book.update(
        { status: draft ? 'draft' : 'in_progress' },
        { where: { id: bookId } }
      );
    },
  }));
});
