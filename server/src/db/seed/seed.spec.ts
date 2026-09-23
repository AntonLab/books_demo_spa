process.env.NODE_ENV ??= 'test';

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  QueryTypes,
  type Model,
  type ModelStatic,
  type Sequelize,
} from 'sequelize';
import { createCreditedBook } from '../../models/creditedBook.testkit.ts';
import { initModels } from '../../models/index.ts';
import { Book } from '../../models/Book.ts';
import { BookAuthor } from '../../models/BookAuthor.ts';
import { Chapter } from '../../models/Chapter.ts';
import { Comment } from '../../models/Comment.ts';
import { Genre } from '../../models/Genre.ts';
import { Like } from '../../models/Like.ts';
import { Notification } from '../../models/Notification.ts';
import { Series } from '../../models/Series.ts';
import { SeriesAuthor } from '../../models/SeriesAuthor.ts';
import { User } from '../../models/User.ts';
import { parseConfig } from '../config.ts';
import { ensureDatabase } from '../ensureDatabase.ts';
import { skipWithoutMysql } from '../mysqlProbe.testkit.ts';
import { createSequelize } from '../sequelize.ts';

// seed.ts is a script with a top-level `await main()`, so it cannot be imported
// without seeding. These tests run it the way `npm run seed` does, as a child
// process, and watch what it does to a schema of their own.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_seed`;

const SERVER_DIR = path.resolve(import.meta.dirname, '../../..');

// The ten tables the seed deletes from under --force. Listed again here
// because a script exports nothing a spec could import.
const CONTENT_MODELS: readonly ModelStatic<Model>[] = [
  Notification,
  Like,
  Comment,
  Chapter,
  BookAuthor,
  Book,
  SeriesAuthor,
  Series,
  Genre,
  User,
];

interface SeedRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runSeed(
  env: NodeJS.ProcessEnv,
  args: readonly string[] = []
): Promise<SeedRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--env-file-if-exists=.env.local', 'src/db/seed/seed.ts', ...args],
      { cwd: SERVER_DIR, env }
    );
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout.push(chunk);
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout: stdout.join(''), stderr: stderr.join('') });
    });
  });
}

async function countRows(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const model of CONTENT_MODELS) {
    counts[model.tableName] = await model.count();
  }
  return counts;
}

// Needs no database: port 1 refuses every connection at once, so a guard that
// let the run through would fail on the connection instead, with a different
// message. The refusal being the error is what shows nothing was reached.
test('NODE_ENV=production exits non-zero before touching the database, --force or not', async () => {
  const run = await runSeed(
    {
      ...process.env,
      NODE_ENV: 'production',
      // Set so the config parses: the refusal under test is the seed's own,
      // not production's missing RESET_DELIVERY.
      RESET_DELIVERY: 'log',
      DB_USER: 'u',
      DB_PASSWORD: 'p',
      DB_HOST: '127.0.0.1',
      DB_PORT: '1',
    },
    ['--force']
  );

  assert.equal(run.code, 1);
  assert.match(run.stderr, /Refusing to seed: NODE_ENV is production/);
  assert.doesNotMatch(run.stderr, /ECONNREFUSED/);
});

const skip = await skipWithoutMysql();

describe('seed.ts without --force against real MySQL', { skip }, () => {
  let sequelize: Sequelize;

  before(async () => {
    const db = parseConfig({
      ...process.env,
      NODE_ENV: 'test',
      DB_NAME: TEST_DB_NAME,
    }).db;
    await ensureDatabase(db);
    sequelize = createSequelize(db);
    initModels(sequelize);
    await sequelize.sync({ force: true });

    const user = await User.create({
      login: 'SeedBystander',
      email: 'seedbystander@example.com',
      password: 'hunter2hunter2',
      firstName: 'Seed',
      lastName: 'Bystander',
    });
    await createCreditedBook(
      { title: 'Kept', description: 'Must survive a dry run', tags: [] },
      [user.id]
    );
  });

  after(async () => {
    await sequelize.close();
  });

  test('reports what it found, exits 0 and changes no row', async () => {
    const found = await countRows();

    const run = await runSeed({
      ...process.env,
      NODE_ENV: 'test',
      DB_NAME: TEST_DB_NAME,
    });

    assert.equal(run.code, 0, run.stderr);
    assert.match(
      run.stdout,
      new RegExp(
        `Dry run: pass --force to delete these rows and reseed ${TEST_DB_NAME}\\b`
      )
    );
    assert.match(run.stdout, /users: 1\b/);
    assert.match(run.stdout, /books: 1\b/);
    // The tenth content table, reported like the other nine: this is what
    // would catch the seed's own CONTENT_MODELS not knowing about genres.
    assert.match(run.stdout, /genres: 0\b/);
    assert.doesNotMatch(run.stdout, /Seeded /);
    // Not stderr === '': a Node release may print its own warnings there. Only
    // the seed's are in question — no --force warning, no failure.
    assert.doesNotMatch(run.stderr, /\] (WARN|ERROR) /);
    assert.equal(found.users, 1);
    assert.deepEqual(await countRows(), found);
  });
});

// After the dry run, in the same schema: node:test runs one file's suites in
// order, and the dry run's bystander would not survive this one.
describe('seed.ts --force against real MySQL', { skip }, () => {
  let sequelize: Sequelize;

  // The offending rows rather than a count, so a failure names them.
  const offending = (sql: string): Promise<object[]> =>
    sequelize.query(sql, { type: QueryTypes.SELECT });

  before(async () => {
    const db = parseConfig({
      ...process.env,
      NODE_ENV: 'test',
      DB_NAME: TEST_DB_NAME,
    }).db;
    await ensureDatabase(db);
    sequelize = createSequelize(db);
    initModels(sequelize);
    await sequelize.sync({ force: true });

    const run = await runSeed(
      { ...process.env, NODE_ENV: 'test', DB_NAME: TEST_DB_NAME },
      ['--force']
    );
    assert.equal(run.code, 0, run.stderr);
  });

  after(async () => {
    await sequelize.close();
  });

  // The seed writes through the models, past likeRepository's checks, so
  // nothing but this stops it writing a like the API would refuse.
  test('writes no like the API would refuse', async () => {
    assert.deepEqual(
      await offending(
        `SELECT l.id FROM likes l
         JOIN comments c ON c.id = l.commentId
         WHERE c.userId = l.userId OR c.tombstone IS NOT NULL`
      ),
      []
    );
    assert.deepEqual(
      await offending(
        `SELECT l.id FROM likes l
         JOIN book_authors ba ON ba.bookId = l.bookId AND ba.userId = l.userId`
      ),
      []
    );
    assert.deepEqual(
      await offending(
        `SELECT l.id FROM likes l
         LEFT JOIN comments c ON c.id = l.commentId
         JOIN books b ON b.id = COALESCE(l.bookId, c.bookId)
         WHERE b.status = 'draft'`
      ),
      []
    );
  });

  test('dates no comment or like before its account was created', async () => {
    assert.deepEqual(
      await offending(
        `SELECT c.id FROM comments c
         JOIN users u ON u.id = c.userId
         WHERE c.createdAt < u.createdAt`
      ),
      []
    );
    assert.deepEqual(
      await offending(
        `SELECT l.id FROM likes l
         JOIN users u ON u.id = l.userId
         WHERE l.createdAt < u.createdAt`
      ),
      []
    );
  });

  test('titles no chapter "X and X" or "A" before a vowel sound', async () => {
    assert.deepEqual(
      await offending(
        `SELECT title FROM chapters
         WHERE title LIKE '% and %'
           AND SUBSTRING_INDEX(title, ' and ', 1) = SUBSTRING_INDEX(title, ' and ', -1)`
      ),
      []
    );
    assert.deepEqual(
      await offending(
        `SELECT title FROM chapters
         WHERE title COLLATE utf8mb4_bin REGEXP '^A ([AEIOU]|Honest )'`
      ),
      []
    );
  });

  test('creates the five genres, and only those', async () => {
    const names = (await Genre.findAll({ order: [['name', 'ASC']] })).map(
      (row) => row.name
    );

    assert.deepEqual(names, [
      'Gothic',
      'Hard SF',
      'Horror',
      'Romance',
      'Urban Fantasy',
    ]);
  });

  test('files every book and series under its author’s genre, and leaves two genres empty', async () => {
    assert.deepEqual(
      await offending('SELECT id, title FROM books WHERE genreId IS NULL'),
      []
    );
    assert.deepEqual(
      await offending('SELECT id, title FROM series WHERE genreId IS NULL'),
      []
    );

    // Three content banks, three genres in use: no two authors share one.
    assert.equal(
      (await offending('SELECT DISTINCT genreId FROM books')).length,
      3
    );

    // Every other genre holds both books and series...
    assert.deepEqual(
      await offending(
        `SELECT g.name FROM genres g
         LEFT JOIN books b ON b.genreId = g.id
         LEFT JOIN series s ON s.genreId = g.id
         WHERE b.id IS NULL AND s.id IS NULL
           AND g.name NOT IN ('Horror', 'Romance')`
      ),
      []
    );
    // ...and these two hold neither, on purpose: a demo with no empty genre
    // never shows what one looks like.
    assert.deepEqual(
      await offending(
        `SELECT g.name FROM genres g
         LEFT JOIN books b ON b.genreId = g.id
         LEFT JOIN series s ON s.genreId = g.id
         WHERE g.name IN ('Horror', 'Romance')
           AND (b.id IS NOT NULL OR s.id IS NOT NULL)`
      ),
      []
    );
  });
});
