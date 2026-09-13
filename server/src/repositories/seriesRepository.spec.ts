process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { parseConfig } from '../db/config.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import {
  Book,
  initModels,
  Series,
  SeriesAuthor,
  User,
} from '../models/index.ts';
import { createCreditedBook } from '../models/creditedBook.testkit.ts';
import { AppError, NotFoundError } from '../types/errors.ts';
import { createSequelizeSeriesRepository } from './seriesRepository.ts';
import type { Viewer } from './visibility.ts';

// A schema of its own rather than the users suite's: node:test runs spec
// files in parallel processes, and two suites calling sync({ force: true })
// on one database would drop each other's tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_series`;

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
  login: 'SeriesOwner',
  email: 'owner@example.com',
  password: 'hunter2hunter2',
  firstName: 'Ola',
  lastName: 'Owner',
};

const coAuthor = {
  login: 'SeriesCoAuthor',
  email: 'series-coauthor@example.com',
  password: 'hunter2hunter2',
  firstName: 'Cora',
  lastName: 'Author',
};

describe('seriesRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  let ownerId: number;
  // Who acts in the calls below. The rules on who may act are the
  // controllers'; this suite is about what each change does.
  const asOwner = () => ({ id: ownerId, role: 'author' as const });
  const repository = createSequelizeSeriesRepository();
  // Most series here hold no book at all, which hides them from a reader. The
  // tests that are not about visibility read as a Moderator, who sees every
  // series.
  const asModerator: Viewer = { id: 0, role: 'superadmin' };

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
    // them. Books are cleared by hand, since a series only unlinks its books.
    await Book.destroy({ where: {}, truncate: false });
    await Series.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
    ownerId = (await User.create(owner)).id;
  });

  test('creating a series credits its creator as its only co-author', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Solo',
      tags: [],
    });

    const expected = [
      {
        id: ownerId,
        login: 'SeriesOwner',
        firstName: 'Ola',
        lastName: 'Owner',
      },
    ];
    assert.deepEqual(created.authors, expected);
    assert.deepEqual(
      (await repository.findById(created.id, asModerator))?.authors,
      expected
    );
  });

  test('a co-author is credited after the ones already there', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
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
      ['SeriesOwner', 'SeriesCoAuthor']
    );
  });

  test('only an account holding the author role can be made a co-author', async () => {
    const readerId = (await User.create({ ...coAuthor, role: 'user' })).id;
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
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
    assert.equal(
      (await repository.findById(created.id, asModerator))?.authors.length,
      1
    );
  });

  test('crediting an account that does not exist blames the user', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
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
      title: 'Test Series',
      description: 'Shared',
      tags: [],
    });
    await repository.addCoAuthor(created.id, coAuthorId, asOwner());

    await assert.rejects(
      repository.addCoAuthor(created.id, coAuthorId, asOwner()),
      (error: unknown) => error instanceof AppError && error.statusCode === 409
    );
  });

  test('removing a co-author leaves the rest credited', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
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
      title: 'Test Series',
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
    assert.equal(
      (await repository.findById(created.id, asModerator))?.authors.length,
      1
    );
  });

  test('removing an account that is not credited is a 404, even on a solo series', async () => {
    const strangerId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Solo',
      tags: [],
    });

    await assert.rejects(
      repository.removeCoAuthor(created.id, strangerId, asOwner()),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Co-author \d+ not found/.test(error.message)
    );
  });

  test('the userId filter matches a series through any of its co-authors', async () => {
    const coAuthorId = (await User.create({ ...coAuthor, role: 'author' })).id;
    const shared = await repository.create({
      userId: ownerId,
      title: 'Shared Series',
      description: 'Shared',
      tags: [],
    });
    await repository.addCoAuthor(shared.id, coAuthorId, asOwner());
    await repository.create({
      userId: ownerId,
      title: 'Solo Series',
      description: 'Solo',
      tags: [],
    });

    const page = await repository.list(
      {
        limit: 20,
        offset: 0,
        userId: coAuthorId,
      },
      asModerator
    );

    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.title, 'Shared Series');
  });

  test('removing a book from a series unlinks it and leaves the book standing', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Holds a book',
      tags: [],
    });
    const filed = await createCreditedBook(
      {
        title: 'Filed',
        description: 'In the series',
        tags: [],
        seriesId: created.id,
      },
      [ownerId]
    );

    assert.equal(await repository.removeBook(created.id, filed.id), true);

    const reloaded = await Book.findByPk(filed.id);
    assert.equal(reloaded?.seriesId, null);
    // Out of the series, out of its order: filing it again appends it afresh.
    assert.equal(reloaded?.seriesPosition, null);
  });

  test('removing a book that is not in the series is a 404 on the book', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Empty',
      tags: [],
    });
    const standalone = await createCreditedBook(
      { title: 'Standalone', description: 'In no series', tags: [] },
      [ownerId]
    );

    await assert.rejects(
      repository.removeBook(created.id, standalone.id),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /Book \d+ not found/.test(error.message)
    );
    assert.equal(
      await repository.removeBook(created.id + 10_000, standalone.id),
      false
    );
  });

  test('round-trips tags through the JSON column as a real array', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'A space opera',
      tags: ['sci-fi', 'epic'],
    });

    const reloaded = await repository.findById(created.id, asModerator);

    assert.ok(Array.isArray(reloaded?.tags));
    assert.deepEqual(reloaded?.tags, ['sci-fi', 'epic']);
  });

  test('stores an empty tag list without a DDL default', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'No tags',
      tags: [],
    });

    assert.deepEqual(
      (await repository.findById(created.id, asModerator))?.tags,
      []
    );
  });

  test('tags survive multi-byte characters, thanks to utf8mb4', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Epic 📚',
      tags: ['sci-fi', '📚'],
    });

    const reloaded = await repository.findById(created.id, asModerator);

    assert.equal(reloaded?.description, 'Epic 📚');
    assert.deepEqual(reloaded?.tags, ['sci-fi', '📚']);
  });

  test('a create against an unknown user surfaces as NotFoundError, not a raw FK error', async () => {
    await assert.rejects(
      repository.create({
        userId: ownerId + 10_000,
        title: 'Test Series',
        description: 'Orphan',
        tags: [],
      }),
      (error: unknown) =>
        error instanceof NotFoundError &&
        /User \d+ not found/.test(error.message)
    );
  });

  test('the tag filter matches through JSON_CONTAINS, not a substring', async () => {
    await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Tagged epic',
      tags: ['epic'],
    });
    await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Tagged epic-fantasy',
      tags: ['epic-fantasy'],
    });

    const exact = await repository.list(
      { limit: 20, offset: 0, tag: 'epic' },
      asModerator
    );

    // A LIKE-based implementation would return both rows here.
    assert.equal(exact.total, 1);
    assert.equal(exact.items[0]?.description, 'Tagged epic');
  });

  test('the description search treats LIKE metacharacters literally', async () => {
    await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Contains a 100% real percent sign',
      tags: [],
    });
    await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'No metacharacter here',
      tags: [],
    });

    const matches = await repository.list(
      { limit: 20, offset: 0, q: '%' },
      asModerator
    );

    assert.equal(matches.total, 1);
    assert.match(matches.items[0]?.description ?? '', /100% real/);
  });

  test('the co-author filter and paging envelope agree on the total', async () => {
    const otherId = (
      await User.create({
        ...owner,
        login: 'OtherOwner',
        email: 'other@example.com',
      })
    ).id;

    for (const description of ['One', 'Two', 'Three']) {
      await repository.create({
        userId: ownerId,
        title: description,
        description,
        tags: [],
      });
    }
    await repository.create({
      userId: otherId,
      title: 'Theirs',
      description: 'Theirs',
      tags: [],
    });

    const page = await repository.list(
      {
        limit: 2,
        offset: 0,
        userId: ownerId,
      },
      asModerator
    );

    assert.equal(page.total, 3);
    assert.equal(page.items.length, 2);
  });

  test('an update replaces the whole tag array and leaves the co-authors alone', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Original',
      tags: ['sci-fi', 'epic'],
    });

    const updated = await repository.update(created.id, { tags: ['drama'] });

    assert.deepEqual(updated?.tags, ['drama']);
    assert.deepEqual(
      updated?.authors.map((author) => author.id),
      [ownerId]
    );
    assert.equal(updated?.description, 'Original');
  });

  test('an update omitting tags leaves the stored ones untouched', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Original',
      tags: ['sci-fi'],
    });

    const updated = await repository.update(created.id, {
      description: 'Rewritten',
    });

    assert.equal(updated?.description, 'Rewritten');
    assert.deepEqual(updated?.tags, ['sci-fi']);
  });

  // The foreign key alone only drops the credit. Whether the series goes too is
  // userRepository.remove's decision, covered in userRepository.spec.ts.
  test('deleting a user row drops their credits and nothing else', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Credited',
      tags: [],
    });

    await User.destroy({ where: { id: ownerId } });

    assert.equal(await SeriesAuthor.count(), 0);
    assert.ok(await Series.findByPk(created.id));
  });

  test('deleting a series drops its credits', async () => {
    const created = await repository.create({
      userId: ownerId,
      title: 'Test Series',
      description: 'Doomed',
      tags: [],
    });

    assert.equal(await repository.remove(created.id, asOwner()), true);
    assert.equal(await SeriesAuthor.count(), 0);
  });

  test('a series with no published book is visible only to its co-authors and moderators', async () => {
    const empty = await repository.create({
      userId: ownerId,
      title: 'Empty',
      description: 'Nothing yet',
      tags: [],
    });
    const drafted = await repository.create({
      userId: ownerId,
      title: 'Drafted',
      description: 'Only drafts',
      tags: [],
    });
    await createCreditedBook(
      {
        title: 'Draft',
        description: 'Private',
        tags: [],
        seriesId: drafted.id,
        status: 'draft',
      },
      [ownerId]
    );
    const out = await repository.create({
      userId: ownerId,
      title: 'Out',
      description: 'Has a published book',
      tags: [],
    });
    await createCreditedBook(
      {
        title: 'Published',
        description: 'Public',
        tags: [],
        seriesId: out.id,
        status: 'complete',
      },
      [ownerId]
    );
    const stranger = ownerId + 1_000;

    const titles = async (viewer: Viewer): Promise<string[]> =>
      (await repository.list({ limit: 20, offset: 0 }, viewer)).items.map(
        (series) => series.title
      );

    for (const viewer of [
      null,
      { id: stranger, role: 'user' },
      { id: stranger, role: 'author' },
    ] as const) {
      assert.deepEqual(await titles(viewer), ['Out']);
      assert.equal(await repository.findById(empty.id, viewer), null);
      assert.equal(await repository.findById(drafted.id, viewer), null);
    }

    for (const viewer of [
      { id: ownerId, role: 'author' },
      { id: stranger, role: 'admin' },
      { id: stranger, role: 'superadmin' },
    ] as const) {
      assert.deepEqual(await titles(viewer), ['Empty', 'Drafted', 'Out']);
      assert.equal((await repository.findById(empty.id, viewer))?.id, empty.id);
    }
  });
});
