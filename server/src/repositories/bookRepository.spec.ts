process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ForeignKeyConstraintError, type Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import {
  Book,
  BookAuthor,
  BookCover,
  initModels,
  Series,
  User,
} from '../models/index.ts';
import { createCreditedSeries } from '../models/creditedBook.testkit.ts';
import {
  AppError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import { createSequelizeBookRepository } from './bookRepository.ts';
import { bookRepositoryContract } from './bookRepository.contract.testkit.ts';
import type { Viewer } from './visibility.ts';

// A schema of its own rather than the users' or series' suite: node:test runs
// spec files in parallel processes, and two suites calling sync({ force: true })
// on one database would drop each other's tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_books`;

function testDbConfig() {
  const config = parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
  });
  return config.db;
}

const skip = await skipWithoutMysql();

const owner = {
  login: 'BookOwner',
  email: 'owner@example.com',
  password: 'hunter2hunter2',
  firstName: 'Ola',
  lastName: 'Owner',
};

const coAuthor = {
  login: 'CoAuthor',
  email: 'coauthor@example.com',
  password: 'hunter2hunter2',
  firstName: 'Cora',
  lastName: 'Author',
};

describe('bookRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  let ownerId: number;
  let seriesId: number;
  // Who acts in the calls below. The rules on who may act are the
  // controllers'; this suite is about what each change does.
  const asOwner = () => ({ id: ownerId, role: 'author' as const });
  const repository = createSequelizeBookRepository();

  // A book every list shows: the filter tests below are about their filters,
  // not about Draft books, which get suites of their own.
  const createPublished = async (
    input: Parameters<typeof repository.create>[0]
  ) => {
    const created = await repository.create(input);
    await repository.update(created.id, { status: 'in_progress' });
    return created;
  };

  const listAsGuest = (query: Parameters<typeof repository.list>[0]) =>
    repository.list(query, null);

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
    // Children first: the foreign keys forbid clearing users out from under
    // them.
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
    ownerId = (await User.create(owner)).id;
    seriesId = (
      await createCreditedSeries(
        { title: 'Test Series', description: 'A trilogy', tags: [] },
        [ownerId]
      )
    ).id;
  });

  test('creating a book credits its creator as its only co-author', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Solo',
      tags: [],
    });

    assert.deepEqual(created.authors, [
      {
        id: ownerId,
        login: 'BookOwner',
        firstName: 'Ola',
        lastName: 'Owner',
        avatarUrl: null,
      },
    ]);
    assert.deepEqual((await repository.findById(created.id))?.authors, [
      {
        id: ownerId,
        login: 'BookOwner',
        firstName: 'Ola',
        lastName: 'Owner',
        avatarUrl: null,
      },
    ]);
  });

  test('a new book starts as a draft and moves through every status', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Status',
      tags: [],
    });
    assert.equal(created.status, 'draft');

    for (const status of ['complete', 'in_progress', 'draft'] as const) {
      assert.equal(
        (await repository.update(created.id, { status }))?.status,
        status
      );
    }
  });

  test('no list shows a draft, except the caller listing their own books', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const draft = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Draft',
      description: 'Private',
      tags: [],
    });
    await repository.addCoAuthor(draft.id, coAuthorId, asOwner());
    const published = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Published',
      description: 'Public',
      tags: [],
    });
    await repository.update(published.id, { status: 'in_progress' });

    const titles = async (
      query: { userId?: number },
      viewer: Viewer
    ): Promise<string[]> =>
      (
        await repository.list({ limit: 20, offset: 0, ...query }, viewer)
      ).items.map((book) => book.title);

    const owner: Viewer = { id: ownerId, role: 'author' };
    const moderator: Viewer = { id: coAuthorId + 1_000, role: 'superadmin' };

    assert.deepEqual(await titles({}, null), ['Published']);
    assert.deepEqual(await titles({}, owner), ['Published']);
    assert.deepEqual(await titles({}, moderator), ['Published']);
    assert.deepEqual(await titles({ userId: ownerId }, moderator), [
      'Published',
    ]);
    // Their own list, and a shared draft shows for either Co-author.
    assert.deepEqual(await titles({ userId: ownerId }, owner), [
      'Draft',
      'Published',
    ]);
    assert.deepEqual(
      await titles({ userId: coAuthorId }, { id: coAuthorId, role: 'author' }),
      ['Draft']
    );
  });

  test('a draft is readable by its co-authors and moderators, and nobody else', async () => {
    const draft = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Draft',
      description: 'Private',
      tags: [],
    });
    const stranger = ownerId + 1_000;

    const readable = async (viewer: Viewer): Promise<boolean> =>
      (await repository.findDetailById(draft.id, viewer)) !== null;

    assert.equal(await readable(null), false);
    assert.equal(await readable({ id: stranger, role: 'user' }), false);
    assert.equal(await readable({ id: stranger, role: 'author' }), false);
    assert.equal(await readable({ id: ownerId, role: 'author' }), true);
    assert.equal(await readable({ id: stranger, role: 'admin' }), true);
    assert.equal(await readable({ id: stranger, role: 'superadmin' }), true);

    await repository.update(draft.id, { status: 'complete' });
    assert.equal(await readable(null), true);
  });

  test('a co-author is credited after the ones already there', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Shared',
      tags: [],
    });

    const updated = await repository.addCoAuthor(
      created.id,
      coAuthorId,
      asOwner()
    );

    assert.deepEqual(
      updated?.authors.map((author) => author.login),
      ['BookOwner', 'CoAuthor']
    );
    assert.deepEqual(
      (await repository.findById(created.id))?.authors.map((a) => a.id),
      [ownerId, coAuthorId]
    );
  });

  test('only an account holding the author role can be made a co-author', async () => {
    const readerId = (await User.create({ ...coAuthor, role: 'user' })).id;
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Shared',
      tags: [],
    });

    await assert.rejects(
      repository.addCoAuthor(created.id, readerId, asOwner()),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 400 &&
        /author role/i.test(error.message)
    );
    assert.equal((await repository.findById(created.id))?.authors.length, 1);
  });

  test('crediting an account that does not exist blames the user', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Shared',
      tags: [],
    });

    await assert.rejects(
      repository.addCoAuthor(created.id, ownerId + 10_000, asOwner()),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /User \d+ not found/.test(error.message)
    );
  });

  test('crediting a co-author twice is a conflict', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Shared',
      tags: [],
    });
    await repository.addCoAuthor(created.id, coAuthorId, asOwner());

    await assert.rejects(
      repository.addCoAuthor(created.id, coAuthorId, asOwner()),
      (error: unknown) => error instanceof AppError && error.statusCode === 409
    );
    assert.equal((await repository.findById(created.id))?.authors.length, 2);
  });

  test('removing a co-author leaves the rest credited', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Shared',
      tags: [],
    });
    await repository.addCoAuthor(created.id, coAuthorId, asOwner());

    const updated = await repository.removeCoAuthor(
      created.id,
      ownerId,
      asOwner()
    );

    assert.deepEqual(
      updated?.authors.map((author) => author.id),
      [coAuthorId]
    );
  });

  test('the last co-author cannot be removed', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Solo',
      tags: [],
    });

    await assert.rejects(
      repository.removeCoAuthor(created.id, ownerId, asOwner()),
      (error: unknown) =>
        error instanceof AppError &&
        error.statusCode === 409 &&
        /last co-author/i.test(error.message)
    );
    assert.equal((await repository.findById(created.id))?.authors.length, 1);
  });

  test('removing an account that is not credited is a 404, even on a solo book', async () => {
    const strangerId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Solo',
      tags: [],
    });

    // A solo book, so a "last co-author" 409 would be the wrong answer: the
    // stranger was never credited, and the owner's credit is untouched.
    await assert.rejects(
      repository.removeCoAuthor(created.id, strangerId, asOwner()),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Co-author \d+ not found/.test(error.message)
    );
  });

  // What every `own` check on a book asks (bookController.assertCoAuthor).
  test('findCoAuthorIds lists the co-authors in credit order, and null for a missing book', async () => {
    const earlierId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const laterId = (
      await User.create({
        ...coAuthor,
        login: 'LaterAuthor',
        email: 'later@example.com',
        role: 'author',
      })
    ).id;
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Shared',
      tags: [],
    });
    // Credited against the order the accounts were made in, so a list sorted
    // by user id would come back the other way round.
    await repository.addCoAuthor(created.id, laterId, asOwner());
    await repository.addCoAuthor(created.id, earlierId, asOwner());

    assert.deepEqual(await repository.findCoAuthorIds(created.id), [
      ownerId,
      laterId,
      earlierId,
    ]);
    assert.equal(await repository.findCoAuthorIds(created.id + 10_000), null);
  });

  // What filing a book into a series asks (bookController.assertMayAddToSeries).
  test('findSeriesCoAuthorIds lists the series co-authors in credit order, and null for a missing series', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const shared = await createCreditedSeries(
      { title: 'Shared Series', description: 'x', tags: [] },
      [coAuthorId, ownerId]
    );

    assert.deepEqual(await repository.findSeriesCoAuthorIds(shared.id), [
      coAuthorId,
      ownerId,
    ]);
    assert.equal(
      await repository.findSeriesCoAuthorIds(shared.id + 10_000),
      null
    );
  });

  // Only the unique index's rejection means "already credited". An account
  // deleted between the lookup and the insert fails the foreign key instead,
  // which reaches the caller unmapped rather than as a misleading 409.
  test('a credit that fails for any reason but a duplicate is not reported as a conflict', async () => {
    const doomedId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Shared',
      tags: [],
    });

    BookAuthor.addHook('beforeCreate', 'deleteAccount', async () => {
      await User.destroy({ where: { id: doomedId } });
    });
    try {
      await assert.rejects(
        repository.addCoAuthor(created.id, doomedId, asOwner()),
        ForeignKeyConstraintError
      );
    } finally {
      BookAuthor.removeHook('beforeCreate', 'deleteAccount');
    }
    assert.deepEqual(await repository.findCoAuthorIds(created.id), [ownerId]);
  });

  test('the userId filter matches a book through any of its co-authors', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const shared = await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Shared Book',
      description: 'Shared',
      tags: [],
    });
    await repository.addCoAuthor(shared.id, coAuthorId, asOwner());
    await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Solo Book',
      description: 'Solo',
      tags: [],
    });

    const page = await listAsGuest({
      limit: 20,
      offset: 0,
      userId: coAuthorId,
    });

    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.title, 'Shared Book');
    assert.equal(
      (await listAsGuest({ limit: 20, offset: 0, userId: ownerId })).total,
      2
    );
  });

  test('round-trips tags through the JSON column as a real array', async () => {
    const created = await createPublished({
      userId: ownerId,
      seriesId,
      title: 'Test Book',
      description: 'Book one',
      tags: ['sci-fi', 'epic'],
    });

    const reloaded = await repository.findById(created.id);

    assert.ok(Array.isArray(reloaded?.tags));
    assert.deepEqual(reloaded?.tags, ['sci-fi', 'epic']);
    assert.equal(reloaded?.seriesId, seriesId);
  });

  test('stores a standalone book with a null seriesId', async () => {
    const created = await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Standalone',
      tags: [],
    });

    assert.equal(created.seriesId, null);
    assert.equal((await repository.findById(created.id))?.seriesId, null);
  });

  test('tags survive multi-byte characters, thanks to utf8mb4', async () => {
    const created = await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Epic 📚',
      tags: ['sci-fi', '📚'],
    });

    const reloaded = await repository.findById(created.id);

    assert.equal(reloaded?.description, 'Epic 📚');
    assert.deepEqual(reloaded?.tags, ['sci-fi', '📚']);
  });

  test('a create against an unknown user surfaces as NotFoundError, not a raw FK error', async () => {
    await assert.rejects(
      repository.create({
        userId: ownerId + 10_000,
        seriesId: null,
        title: 'Test Book',
        description: 'Orphan',
        tags: [],
      }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /User \d+ not found/.test(error.message)
    );
  });

  // The two foreign keys are only distinguishable through MySQL's constraint
  // text, so this asserts the repository blames the right one — a "User not
  // found" here would send the caller hunting for a user that exists.
  test('a create against an unknown series blames the series, not the user', async () => {
    await assert.rejects(
      repository.create({
        userId: ownerId,
        seriesId: seriesId + 10_000,
        title: 'Test Book',
        description: 'Orphan',
        tags: [],
      }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Series \d+ not found/.test(error.message)
    );
  });

  test('an update to an unknown series is a NotFoundError on the series', async () => {
    const created = await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Standalone',
      tags: [],
    });

    await assert.rejects(
      repository.update(created.id, { seriesId: seriesId + 10_000 }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Series \d+ not found/.test(error.message)
    );
  });

  test('the tag filter matches through JSON_CONTAINS, not a substring', async () => {
    await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Tagged epic',
      tags: ['epic'],
    });
    await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Tagged epic-fantasy',
      tags: ['epic-fantasy'],
    });

    const exact = await listAsGuest({ limit: 20, offset: 0, tag: 'epic' });

    // A LIKE-based implementation would return both rows here.
    assert.equal(exact.total, 1);
    assert.equal(exact.items[0]?.description, 'Tagged epic');
  });

  test('list finds a book by its title', async () => {
    await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'The Dragon Gate',
      description: 'unrelated prose',
      tags: [],
    });

    const { items } = await listAsGuest({
      limit: 20,
      offset: 0,
      q: 'Dragon Gate',
    });

    assert.equal(items.length, 1);
    assert.equal(items[0]?.title, 'The Dragon Gate');
  });

  test('the description search treats LIKE metacharacters literally', async () => {
    await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Contains a 100% real percent sign',
      tags: [],
    });
    await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'No metacharacter here',
      tags: [],
    });

    const matches = await listAsGuest({ limit: 20, offset: 0, q: '%' });

    assert.equal(matches.total, 1);
    assert.match(matches.items[0]?.description ?? '', /100% real/);
  });

  test('the series filter and paging envelope agree on the total', async () => {
    for (const description of ['One', 'Two', 'Three']) {
      await createPublished({
        userId: ownerId,
        title: description,
        seriesId,
        description,
        tags: [],
      });
    }
    await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Standalone',
      tags: [],
    });

    const page = await listAsGuest({ limit: 2, offset: 0, seriesId });

    assert.equal(page.total, 3);
    assert.equal(page.items.length, 2);
  });

  test('an update replaces the whole tag array and leaves the co-authors alone', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId,
      title: 'Test Book',
      description: 'Original',
      tags: ['sci-fi', 'epic'],
    });

    const updated = await repository.update(created.id, { tags: ['drama'] });

    assert.deepEqual(updated?.tags, ['drama']);
    assert.deepEqual(
      updated?.authors.map((author) => author.id),
      [ownerId]
    );
    assert.equal(updated?.seriesId, seriesId);
    assert.equal(updated?.description, 'Original');
  });

  test('an update omitting tags and seriesId leaves both untouched', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId,
      title: 'Test Book',
      description: 'Original',
      tags: ['sci-fi'],
    });

    const updated = await repository.update(created.id, {
      description: 'Rewritten',
    });

    assert.equal(updated?.description, 'Rewritten');
    assert.deepEqual(updated?.tags, ['sci-fi']);
    assert.equal(updated?.seriesId, seriesId);
  });

  test('an explicit null seriesId unlinks the book from its series', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId,
      title: 'Test Book',
      description: 'Leaving the series',
      tags: [],
    });

    const updated = await repository.update(created.id, { seriesId: null });

    assert.equal(updated?.seriesId, null);
  });

  // The foreign key alone only drops the credit. Whether the book goes too is
  // userRepository.remove's decision — it deletes the books an account was the
  // last Co-author of — and is covered in userRepository.spec.ts.
  test('deleting a user row drops their credits and nothing else', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Credited',
      tags: [],
    });

    await User.destroy({ where: { id: ownerId } });

    assert.equal(await BookAuthor.count(), 0);
    assert.ok(await Book.findByPk(created.id));
  });

  test('deleting a book drops its credits', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Doomed',
      tags: [],
    });

    assert.equal(await repository.remove(created.id, asOwner()), true);
    assert.equal(await BookAuthor.count(), 0);
  });

  test('deleting the series unlinks its books instead of destroying them', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId,
      title: 'Test Book',
      description: 'Survivor',
      tags: [],
    });

    await Series.destroy({ where: { id: seriesId } });

    const reloaded = await repository.findById(created.id);
    assert.equal(reloaded?.description, 'Survivor');
    assert.equal(reloaded?.seriesId, null);
  });

  // --- Series order (CONTEXT.md). ---

  const fileBook = (title: string, into: number | null = seriesId) =>
    createPublished({
      userId: ownerId,
      seriesId: into,
      title,
      description: title,
      tags: [],
    });

  const seriesTitles = async (id: number = seriesId): Promise<string[]> =>
    (await listAsGuest({ limit: 20, offset: 0, seriesId: id })).items.map(
      (book) => book.title
    );

  test('a book filed into a series is appended at the end of the Series order', async () => {
    const one = await fileBook('One');
    const two = await fileBook('Two');
    await repository.reorderInSeries(seriesId, [two.id, one.id]);

    await fileBook('Three');
    const standalone = await fileBook('Moved in', null);
    await repository.update(standalone.id, { seriesId });

    assert.deepEqual(await seriesTitles(), ['Two', 'One', 'Three', 'Moved in']);
  });

  test('a book keeps its place when saved into the same series, and is appended when moved to another', async () => {
    const other = await createCreditedSeries(
      { title: 'Other', description: 'x', tags: [] },
      [ownerId]
    );
    const one = await fileBook('One');
    const two = await fileBook('Two');
    await fileBook('Elsewhere', other.id);

    // Appending it again would put One after Two.
    await repository.update(one.id, { seriesId, description: 'Resaved' });
    assert.deepEqual(await seriesTitles(), ['One', 'Two']);

    await repository.update(one.id, { seriesId: other.id });
    assert.deepEqual(await seriesTitles(other.id), ['Elsewhere', 'One']);
    assert.deepEqual(await seriesTitles(), ['Two']);

    await repository.update(two.id, { seriesId: null });
    assert.equal((await Book.findByPk(two.id))?.seriesPosition, null);
  });

  test('books filed into a series at the same moment still get a place each', async () => {
    await Promise.all(
      ['A', 'B', 'C', 'D', 'E'].map((title) => fileBook(title))
    );

    const positions = (
      await Book.findAll({
        where: { seriesId },
        attributes: ['seriesPosition'],
      })
    ).map((book) => book.seriesPosition);
    assert.equal(new Set(positions).size, 5);
  });

  test('a series reorder rewrites the order its lists follow, and the editor list keeps its drafts', async () => {
    const one = await fileBook('One');
    const draft = await repository.create({
      userId: ownerId,
      seriesId,
      title: 'Draft',
      description: 'Not out',
      tags: [],
    });
    const three = await fileBook('Three');

    assert.equal(
      await repository.reorderInSeries(seriesId, [three.id, draft.id, one.id]),
      true
    );

    assert.deepEqual(await seriesTitles(), ['Three', 'One']);
    const editorList = await repository.listInSeries(seriesId);
    assert.deepEqual(
      editorList?.map((book) => [book.title, book.status]),
      [
        ['Three', 'in_progress'],
        ['Draft', 'draft'],
        ['One', 'in_progress'],
      ]
    );
    // A summary: the draft's title and status, never its text.
    assert.deepEqual(Object.keys(editorList?.[1] ?? {}).sort(), [
      'authors',
      'id',
      'status',
      'title',
    ]);
    assert.deepEqual(
      editorList?.[0]?.authors.map((author) => author.id),
      [ownerId]
    );
  });

  test('a series reorder leaves every book version alone', async () => {
    const one = await fileBook('One');
    const two = await fileBook('Two');
    const before = (await Book.findByPk(one.id))?.updatedAt.getTime();

    await repository.reorderInSeries(seriesId, [two.id, one.id]);

    assert.equal((await Book.findByPk(one.id))?.updatedAt.getTime(), before);
  });

  test('a series reorder that does not name exactly the books in the series is a conflict and changes nothing', async () => {
    const one = await fileBook('One');
    const two = await fileBook('Two');
    const standalone = await fileBook('Standalone', null);

    for (const bookIds of [
      [two.id],
      [two.id, one.id, one.id + 10_000],
      [two.id, standalone.id],
    ]) {
      await assert.rejects(
        repository.reorderInSeries(seriesId, bookIds),
        (error: unknown) => error instanceof StateConflictError,
        JSON.stringify(bookIds)
      );
    }

    assert.deepEqual(await seriesTitles(), ['One', 'Two']);
  });

  test('a missing series has no books to list or reorder', async () => {
    assert.equal(await repository.listInSeries(seriesId + 10_000), null);
    assert.equal(
      await repository.reorderInSeries(seriesId + 10_000, [1]),
      false
    );
  });

  test('a series eager-loads its books under the `books` alias', async () => {
    await repository.create({
      userId: ownerId,
      seriesId,
      title: 'Test Book',
      description: 'A',
      tags: [],
    });
    await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'B',
      tags: [],
    });

    const loadedSeries = await Series.findByPk(seriesId, {
      include: { association: 'books' },
    });

    assert.equal(loadedSeries?.books?.length, 1);
  });

  // --- Cover storage (S1-S4, T2). ---

  test('a cover round-trips through setCover/getCoverData, and a second upload replaces the first', async () => {
    // Published, not a fresh draft: this test is about the round-trip, not
    // about who may read a draft's cover — that is the next test's job, and a
    // guest reading a draft's cover would fail for the wrong reason.
    const created = await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Has a cover',
      tags: [],
    });
    const guest: Viewer = null;

    assert.equal(await repository.getCoverData(created.id, guest), null);

    const first = Buffer.from('first-cover-bytes');
    assert.equal(await repository.setCover(created.id, first), true);
    const stored = await repository.getCoverData(created.id, guest);
    assert.deepEqual(stored?.data, first);

    const second = Buffer.from('second-cover-bytes, longer than the first');
    assert.equal(await repository.setCover(created.id, second), true);
    const replaced = await repository.getCoverData(created.id, guest);
    assert.deepEqual(replaced?.data, second);
    assert.ok(
      (replaced?.updatedAt.getTime() ?? 0) >= (stored?.updatedAt.getTime() ?? 0)
    );
  });

  test('setCover and removeCover on a missing book report it, and removing a cover that never existed is a no-op', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'No cover yet',
      tags: [],
    });
    const missingId = ownerId + 10_000;

    assert.equal(await repository.setCover(missingId, Buffer.from('x')), false);
    await repository.removeCover(missingId);
    await repository.removeCover(created.id);
    assert.equal(await repository.getCoverData(created.id, null), null);
  });

  test('a draft book cover is unreadable to a guest and a non-co-author, readable to a co-author and a moderator', async () => {
    const draft = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Draft',
      description: 'Private',
      tags: [],
    });
    await repository.setCover(draft.id, Buffer.from('draft-cover'));
    const stranger = ownerId + 10_000;

    assert.equal(await repository.getCoverData(draft.id, null), null);
    assert.equal(
      await repository.getCoverData(draft.id, { id: stranger, role: 'user' }),
      null
    );
    assert.ok(
      await repository.getCoverData(draft.id, { id: ownerId, role: 'author' })
    );
    assert.ok(
      await repository.getCoverData(draft.id, { id: stranger, role: 'admin' })
    );
  });

  test('deleting a book takes its cover with it', async () => {
    const created = await repository.create({
      userId: ownerId,
      seriesId: null,
      title: 'Test Book',
      description: 'Doomed',
      tags: [],
    });
    await repository.setCover(created.id, Buffer.from('gone-soon'));

    await repository.remove(created.id, asOwner());

    // A fresh row would answer null through getCoverData too, but a direct
    // model read is what actually proves the cascade rather than merely a
    // missing book.
    assert.equal(await BookCover.findByPk(created.id), null);
  });

  test('a list read returns the version without the bytes', async () => {
    const withCover = await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'Has A Cover',
      description: 'B',
      tags: [],
    });
    const withoutCover = await createPublished({
      userId: ownerId,
      seriesId: null,
      title: 'No Cover',
      description: 'B',
      tags: [],
    });
    await repository.setCover(withCover.id, Buffer.from('list-cover-bytes'));

    const { items } = await listAsGuest({ limit: 20, offset: 0 });

    const withCoverItem = items.find((item) => item.id === withCover.id);
    const withoutCoverItem = items.find((item) => item.id === withoutCover.id);
    assert.match(
      withCoverItem?.coverUrl ?? '',
      new RegExp(`^/api/books/${withCover.id}/cover\\?v=\\d+$`)
    );
    assert.ok(withCoverItem && !('data' in withCoverItem));
    assert.equal(withoutCoverItem?.coverUrl, null);
  });

  // --- The contract the route specs' fake is held to, run here for real. ---

  let contractAccounts = 0;
  bookRepositoryContract(async () => ({
    repository,
    async anAuthor() {
      contractAccounts += 1;
      const user = await User.create({
        ...coAuthor,
        login: `ContractAuthor${contractAccounts}`,
        email: `contract-author-${contractAccounts}@example.com`,
        role: 'author',
      });
      return user.id;
    },
    async aSeries(coAuthorIds) {
      const series = await createCreditedSeries(
        { title: 'Contract Series', description: 'x', tags: [] },
        coAuthorIds
      );
      return series.id;
    },
  }));
});
