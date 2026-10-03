import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAN_MARK_THRESHOLD,
  type ReportReason,
  type ReportStatus,
} from 'shared';
import {
  as,
  SPAM,
  type ReportContractWorld,
} from './reportRepository.contract.testkit.ts';

// Whole seconds only: MySQL DATETIME rounds milliseconds.
const at = (iso: string) => new Date(`${iso}Z`);
export const EVER = {
  from: at('2000-01-01T00:00:00'),
  to: at('2100-01-01T00:00:00'),
};

export interface ReportListWorld extends ReportContractWorld {
  // Inserts a Report row directly; defaults: no reporter, spam, new, now,
  // reported Account = the Comment's owner.
  aReport(
    commentId: number,
    fields?: Partial<{
      reporterId: number | null;
      isSystem: boolean;
      reason: ReportReason;
      explanation: string | null;
      status: ReportStatus;
      createdAt: Date;
      settledAt: Date | null;
      moderatorId: number | null;
      reportedAccountId: number | null;
    }>
  ): Promise<number>;
  // Deletes the Account the way the database does: its Reports keep their rows with the account nulled.
  deleteAccount(id: number): Promise<void>;
  loginOf(accountId: number): Promise<string>;
  bookIdOf(commentId: number): Promise<number>;
  textOf(commentId: number): Promise<string>;
}

export function reportListContract(
  setUp: () => Promise<ReportListWorld>
): void {
  const withComment = async () => {
    const world = await setUp();
    const [ownerId, reporterId] = [
      await world.anAccount(),
      await world.anAccount(),
    ];
    return {
      ...world,
      ownerId,
      reporterId,
      commentId: await world.aComment(ownerId),
    };
  };

  test('contract list: a row carries reporter, reported Account, Comment and status', async () => {
    const w = await withComment();
    const { id } = await w.repository.create(
      w.commentId,
      { reason: 'other', explanation: 'rude' },
      as(w.reporterId)
    );
    const { items, total } = await w.repository.list(
      { ...EVER, limit: 20, offset: 0 },
      as(w.reporterId)
    );
    assert.equal(total, 1);
    assert.equal(items[0]?.id, id);
    assert.deepEqual(items[0]?.reporter, {
      id: w.reporterId,
      login: await w.loginOf(w.reporterId),
    });
    assert.equal(items[0]?.reportedAccount?.login, await w.loginOf(w.ownerId));
    assert.equal(items[0]?.reportedAccount?.atBanThreshold, false);
    assert.deepEqual(items[0]?.comment, {
      id: w.commentId,
      bookId: await w.bookIdOf(w.commentId),
      text: await w.textOf(w.commentId),
      tombstone: null,
    });
    assert.deepEqual(
      [
        items[0]?.status,
        items[0]?.reason,
        items[0]?.explanation,
        items[0]?.moderatorLogin,
        items[0]?.moderatorId,
        items[0]?.isOwnComment,
      ],
      ['new', 'other', 'rude', null, null, false]
    );
  });

  test('contract list: the range includes from and excludes to', async () => {
    const w = await withComment();
    const [a, b, c] = [
      at('2026-03-10T12:00:00'),
      at('2026-03-10T13:00:00'),
      at('2026-03-10T14:00:00'),
    ];
    const ids = [
      await w.aReport(w.commentId, { createdAt: a, status: 'dismissed' }),
      await w.aReport(w.commentId, { createdAt: b, status: 'dismissed' }),
      await w.aReport(w.commentId, { createdAt: c, status: 'dismissed' }),
    ];
    const { items } = await w.repository.list(
      { from: a, to: c, limit: 20, offset: 0 },
      as(w.reporterId)
    );
    assert.deepEqual(
      items.map((row) => row.id),
      [ids[1], ids[0]]
    );
  });

  test('contract list: newest first, status filter, and total ignores the page', async () => {
    const w = await withComment();
    const first = await w.aReport(w.commentId, {
      createdAt: at('2026-03-10T10:00:00'),
      status: 'dismissed',
    });
    const second = await w.aReport(w.commentId, {
      createdAt: at('2026-03-10T11:00:00'),
      status: 'upheld',
    });
    const third = await w.aReport(w.commentId, {
      createdAt: at('2026-03-10T12:00:00'),
      status: 'dismissed',
    });
    const viewer = as(w.reporterId);
    const page = await w.repository.list(
      { ...EVER, limit: 2, offset: 0 },
      viewer
    );
    assert.deepEqual(
      [page.items.map((row) => row.id), page.total],
      [[third, second], 3]
    );
    const rest = await w.repository.list(
      { ...EVER, limit: 2, offset: 2 },
      viewer
    );
    assert.deepEqual(
      rest.items.map((row) => row.id),
      [first]
    );
    const dismissed = await w.repository.list(
      { ...EVER, status: 'dismissed', limit: 20, offset: 0 },
      viewer
    );
    assert.deepEqual(
      [dismissed.items.map((row) => row.id), dismissed.total],
      [[third, first], 2]
    );
  });

  test('contract list: a system Report has no reporter and says so', async () => {
    const w = await withComment();
    await w.aReport(w.commentId, { reporterId: null, isSystem: true });
    const { items } = await w.repository.list(
      { ...EVER, limit: 20, offset: 0 },
      as(w.reporterId)
    );
    assert.deepEqual([items[0]?.reporter, items[0]?.isSystem], [null, true]);
  });

  test('contract list: a deleted reporter or reported Account stays listed as null, not as System', async () => {
    const w = await withComment();
    const { id } = await w.repository.create(
      w.commentId,
      SPAM,
      as(w.reporterId)
    );
    await w.deleteAccount(w.reporterId);
    await w.deleteAccount(w.ownerId);
    const { items } = await w.repository.list(
      { ...EVER, limit: 20, offset: 0 },
      as(await w.anAccount())
    );
    assert.deepEqual(
      [
        items[0]?.id,
        items[0]?.reporter,
        items[0]?.isSystem,
        items[0]?.reportedAccount,
      ],
      [id, null, false, null]
    );
  });

  test('contract list: a Tombstone shows its kind and no text', async () => {
    const w = await withComment();
    await w.aReport(w.commentId, { status: 'upheld' });
    await w.setTombstone(w.commentId, 'removed');
    const { items } = await w.repository.list(
      { ...EVER, limit: 20, offset: 0 },
      as(w.reporterId)
    );
    assert.deepEqual(
      [items[0]?.comment.text, items[0]?.comment.tombstone],
      ['', 'removed']
    );
  });

  test('contract list: isOwnComment is true for the Comment’s owner', async () => {
    const w = await withComment();
    await w.aReport(w.commentId);
    const { items } = await w.repository.list(
      { ...EVER, limit: 20, offset: 0 },
      as(w.ownerId, 'admin')
    );
    assert.equal(items[0]?.isOwnComment, true);
  });

  test('contract list: the ban mark needs the threshold in distinct Comments with an Upheld Report', async () => {
    const w = await withComment();
    for (let i = 1; i < BAN_MARK_THRESHOLD - 1; i += 1)
      await w.aReport(await w.aComment(w.ownerId), { status: 'upheld' });
    await w.aReport(w.commentId, { status: 'upheld' });
    await w.aReport(w.commentId, { status: 'upheld' });
    await w.aReport(await w.aComment(w.ownerId), { status: 'dismissed' });
    const mark = async () =>
      (
        await w.repository.list(
          { ...EVER, limit: 1, offset: 0 },
          as(w.reporterId)
        )
      ).items[0]?.reportedAccount?.atBanThreshold;
    assert.equal(
      await mark(),
      false,
      'nine distinct upheld Comments, a repeat on one and a dismissed one'
    );
    await w.aReport(await w.aComment(w.ownerId), { status: 'upheld' });
    assert.equal(await mark(), true);
    await w.setTombstone(w.commentId, null);
    assert.equal(await mark(), true, 'a restored Comment still counts');
  });
}
