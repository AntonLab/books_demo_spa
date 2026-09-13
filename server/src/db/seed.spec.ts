process.env.NODE_ENV ??= 'test';

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Model, ModelStatic, Sequelize } from 'sequelize';
import { createCreditedBook } from '../models/creditedBook.testkit.ts';
import {
  Book,
  BookAuthor,
  Chapter,
  Comment,
  Like,
  Notification,
  Series,
  SeriesAuthor,
  User,
  initModels,
} from '../models/index.ts';
import { parseConfig } from './config.ts';
import { ensureDatabase } from './ensureDatabase.ts';
import { skipWithoutMysql } from './mysqlProbe.testkit.ts';
import { createSequelize } from './sequelize.ts';

// seed.ts is a script with a top-level `await main()`, so it cannot be imported
// without seeding. These tests run it the way `npm run seed` does, as a child
// process, and watch what it does to a schema of their own.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_seed`;

const SERVER_DIR = path.resolve(import.meta.dirname, '../..');

// The nine tables the seed deletes from under --force. Listed again here
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
      ['--env-file-if-exists=.env.local', 'src/db/seed.ts', ...args],
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
    assert.doesNotMatch(run.stdout, /Seeded /);
    // Not stderr === '': a Node release may print its own warnings there. Only
    // the seed's are in question — no --force warning, no failure.
    assert.doesNotMatch(run.stderr, /\] (WARN|ERROR) /);
    assert.equal(found.users, 1);
    assert.deepEqual(await countRows(), found);
  });
});
