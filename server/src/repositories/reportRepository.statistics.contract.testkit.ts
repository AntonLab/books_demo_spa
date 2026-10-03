import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVER,
  type ReportListWorld,
} from './reportRepository.list.contract.testkit.ts';

const at = (iso: string) => new Date(`${iso}Z`);
const DAY = {
  from: at('2026-03-10T00:00:00'),
  to: at('2026-03-11T00:00:00'),
};

export function reportStatisticsContract(
  setUp: () => Promise<ReportListWorld>
): void {
  const withComment = async () => {
    const world = await setUp();
    const ownerId = await world.anAccount();
    return { ...world, ownerId, commentId: await world.aComment(ownerId) };
  };

  test('contract statistics: counts cover Reports created in the range, with every key present', async () => {
    const w = await withComment();
    await w.aReport(w.commentId, {
      createdAt: at('2026-03-10T10:00:00'),
      settledAt: at('2026-03-10T10:01:00'),
      status: 'upheld',
      reason: 'spam',
    });
    await w.aReport(w.commentId, {
      createdAt: at('2026-03-09T23:00:00'),
      settledAt: at('2026-03-10T01:00:00'),
      status: 'dismissed',
      reason: 'other',
    });
    await w.aReport(w.commentId, {
      createdAt: at('2026-03-10T12:00:00'),
      status: 'new',
      reason: 'harassment',
    });
    await w.aReport(w.commentId, {
      createdAt: at('2026-03-11T00:00:00'),
      status: 'new',
      reason: 'spoilers',
    });
    await w.aReport(w.commentId, {
      createdAt: at('2026-03-10T09:00:00'),
      settledAt: at('2026-03-11T00:00:00'),
      status: 'dismissed',
      reason: 'spam',
    });
    const stats = await w.repository.statistics(DAY);
    assert.deepEqual(stats.byStatus, {
      new: 1,
      in_review: 0,
      upheld: 1,
      dismissed: 1,
    });
    assert.deepEqual(stats.byReason, {
      spam: 2,
      harassment: 1,
      spoilers: 0,
      other: 0,
    });
  });

  test('contract statistics: the average covers Reports settled in the range, whenever they were created', async () => {
    const w = await withComment();
    await w.aReport(w.commentId, {
      createdAt: at('2026-03-10T10:00:00'),
      settledAt: at('2026-03-10T10:01:00'),
      status: 'upheld',
    });
    await w.aReport(w.commentId, {
      createdAt: at('2026-03-09T23:00:00'),
      settledAt: at('2026-03-10T01:00:00'),
      status: 'dismissed',
    });
    await w.aReport(w.commentId, {
      createdAt: at('2026-03-10T09:00:00'),
      settledAt: at('2026-03-11T00:00:00'),
      status: 'dismissed',
    });
    await w.aReport(w.commentId, {
      createdAt: at('2026-03-10T12:00:00'),
      status: 'new',
    });
    assert.equal(
      (await w.repository.statistics(DAY)).averageSettleSeconds,
      (60 + 7200) / 2
    );
  });

  test('contract statistics: an empty range gives zeros, an empty list and a null average', async () => {
    const w = await withComment();
    await w.aReport(w.commentId, { createdAt: at('2026-03-10T10:00:00') });
    const stats = await w.repository.statistics({
      from: at('2030-01-01T00:00:00'),
      to: at('2030-01-02T00:00:00'),
    });
    assert.deepEqual(stats.byStatus, {
      new: 0,
      in_review: 0,
      upheld: 0,
      dismissed: 0,
    });
    assert.deepEqual(stats.byReason, {
      spam: 0,
      harassment: 0,
      spoilers: 0,
      other: 0,
    });
    assert.deepEqual(
      [stats.topAccounts, stats.averageSettleSeconds],
      [[], null]
    );
  });

  test('contract statistics: the top five rank by count then id and skip deleted Accounts', async () => {
    const w = await setUp();
    const counts = [3, 3, 2, 1, 1, 1];
    const owners: number[] = [];
    for (const count of counts) {
      const ownerId = await w.anAccount();
      owners.push(ownerId);
      const commentId = await w.aComment(ownerId);
      for (let i = 0; i < count; i += 1) {
        await w.aReport(commentId, {
          createdAt: at('2026-03-10T10:00:00'),
          status: 'dismissed',
        });
      }
    }
    const top = async () => (await w.repository.statistics(EVER)).topAccounts;
    assert.deepEqual(
      (await top()).map((row) => [row.id, row.count]),
      [
        [owners[0], 3],
        [owners[1], 3],
        [owners[2], 2],
        [owners[3], 1],
        [owners[4], 1],
      ]
    );
    assert.equal((await top())[0]?.login, await w.loginOf(owners[0]!));
    await w.deleteAccount(owners[3]!);
    assert.deepEqual(
      (await top()).map((row) => row.id),
      [owners[0], owners[1], owners[2], owners[4], owners[5]]
    );
  });
}
