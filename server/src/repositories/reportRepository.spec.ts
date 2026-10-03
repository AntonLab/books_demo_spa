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
import { Comment } from '../models/Comment.ts';
import { Report } from '../models/Report.ts';
import { User } from '../models/User.ts';
import { createCreditedBook } from '../models/creditedBook.testkit.ts';
import { createSequelizeReportRepository } from './reportRepository.ts';
import {
  as,
  isConflict,
  reportCreateContract,
  SPAM,
} from './reportRepository.contract.testkit.ts';
import {
  reportActionsContract,
  type ReportActionsWorld,
} from './reportRepository.actions.contract.testkit.ts';
import { reportListContract } from './reportRepository.list.contract.testkit.ts';
import { reportStatisticsContract } from './reportRepository.statistics.contract.testkit.ts';

// A schema of its own: node:test runs spec files in parallel processes, and
// two suites calling sync({ force: true }) on one database drop each other's
// tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_reports`;

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
async function createAccount(role: 'user' | 'author' = 'user') {
  accountCount += 1;
  return User.create({
    login: `ReportAccount${accountCount}`,
    email: `report-account-${accountCount}@example.com`,
    password: 'hunter2hunter2',
    firstName: 'Rae',
    lastName: `Account${accountCount}`,
    role,
  });
}

describe('reportRepository against real MySQL', { skip }, () => {
  let sequelize: Sequelize;
  const repository = createSequelizeReportRepository();

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
    await Report.destroy({ where: {}, truncate: false });
    await Comment.destroy({ where: {}, truncate: false });
    await Book.destroy({ where: {}, truncate: false });
    await User.destroy({ where: {}, truncate: false });
  });

  const setUp = async (): Promise<ReportActionsWorld> => {
    let bookId: number | undefined;
    const aBook = async () =>
      (bookId ??= (
        await createCreditedBook(
          { title: 'Report Book', description: 'x', tags: [] },
          [(await createAccount('author')).id]
        )
      ).id);
    return {
      repository,
      async anAccount() {
        return (await createAccount()).id;
      },
      async aComment(ownerId) {
        return (
          await Comment.create({
            userId: ownerId,
            bookId: await aBook(),
            text: `Comment by ${ownerId}`,
          })
        ).id;
      },
      async setTombstone(commentId, kind) {
        await Comment.update({ tombstone: kind }, { where: { id: commentId } });
      },
      async storedReports(commentId) {
        const rows = await Report.findAll({
          where: { commentId },
          order: [['id', 'ASC']],
        });
        return rows.map(
          ({
            id,
            status,
            reason,
            explanation,
            reporterId,
            reportedAccountId,
            isSystem,
          }) => ({
            id,
            status,
            reason,
            explanation,
            reporterId,
            reportedAccountId,
            isSystem,
          })
        );
      },
      async aReport(commentId, fields = {}) {
        const comment = await Comment.findByPk(commentId);
        return (
          await Report.create({
            commentId,
            reportedAccountId: comment?.userId ?? null,
            reason: 'spam',
            ...fields,
          })
        ).id;
      },
      async deleteAccount(id) {
        await User.destroy({ where: { id } });
      },
      async loginOf(id) {
        return (await User.findByPk(id))?.login ?? '';
      },
      async bookIdOf(commentId) {
        return (await Comment.findByPk(commentId))?.bookId ?? 0;
      },
      async textOf(commentId) {
        return (await Comment.findByPk(commentId))?.text ?? '';
      },
      async commentTombstone(commentId) {
        return (await Comment.findByPk(commentId))?.tombstone ?? null;
      },
      async reportState(id) {
        const row = await Report.findByPk(id);
        return {
          moderatorId: row?.moderatorId ?? null,
          takenAt: row?.takenAt ?? null,
          settledAt: row?.settledAt ?? null,
          settledText: row?.settledText ?? null,
        };
      },
    };
  };

  reportCreateContract(setUp);
  reportListContract(setUp);
  reportActionsContract(setUp);
  reportStatisticsContract(setUp);

  test('two Moderators taking together: exactly one wins, the other gets 409', async () => {
    const w = await setUp();
    const commentId = await w.aComment(await w.anAccount());
    await w.aReport(commentId, { reporterId: await w.anAccount() });
    const results = await Promise.allSettled([
      w.repository.take(commentId, as(await w.anAccount(), 'admin')),
      w.repository.take(commentId, as(await w.anAccount(), 'admin')),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [
      'fulfilled',
      'rejected',
    ]);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.ok(rejected && isConflict(rejected.reason));
  });

  test('two Accounts reporting together leave one Report and one 409', async () => {
    const w = await setUp();
    const commentId = await w.aComment(await w.anAccount());
    const results = await Promise.allSettled([
      w.repository.create(commentId, SPAM, as(await w.anAccount())),
      w.repository.create(commentId, SPAM, as(await w.anAccount())),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [
      'fulfilled',
      'rejected',
    ]);
    assert.equal((await w.storedReports(commentId)).length, 1);
  });

  test('system Reports with no reporter coexist on one Comment', async () => {
    const w = await setUp();
    const commentId = await w.aComment(await w.anAccount());
    await w.aReport(commentId, {
      reporterId: null,
      isSystem: true,
      status: 'dismissed',
    });
    await w.aReport(commentId, { reporterId: null, isSystem: true });
    assert.equal((await w.storedReports(commentId)).length, 2);
  });

  test('deleting the Comment removes its Reports; deleting the reporter keeps the row', async () => {
    const w = await setUp();
    const [reporterId, commentId] = [
      await w.anAccount(),
      await w.aComment(await w.anAccount()),
    ];
    await w.repository.create(commentId, SPAM, as(reporterId));
    await w.deleteAccount(reporterId);
    assert.equal((await w.storedReports(commentId))[0]?.reporterId, null);
    await Comment.destroy({ where: { id: commentId } });
    assert.equal((await w.storedReports(commentId)).length, 0);
  });
});
