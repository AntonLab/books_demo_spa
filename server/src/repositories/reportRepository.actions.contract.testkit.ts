import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Tombstone } from 'shared';
import { ForbiddenError, NotFoundError } from '../types/errors.ts';
import {
  as,
  isConflict,
  MISSING_ID,
} from './reportRepository.contract.testkit.ts';
import type { ReportListWorld } from './reportRepository.list.contract.testkit.ts';

export interface ReportActionsWorld extends ReportListWorld {
  commentTombstone(commentId: number): Promise<Tombstone | null>;
  reportState(reportId: number): Promise<{
    moderatorId: number | null;
    takenAt: Date | null;
    settledAt: Date | null;
    settledText: string | null;
  }>;
}

export function reportActionsContract(
  setUp: () => Promise<ReportActionsWorld>
): void {
  const withReports = async () => {
    const world = await setUp();
    const [ownerId, firstMod, secondMod] = [
      await world.anAccount(),
      await world.anAccount(),
      await world.anAccount(),
    ];
    const commentId = await world.aComment(ownerId);
    const reports = [
      await world.aReport(commentId, { reporterId: await world.anAccount() }),
      await world.aReport(commentId, { reporterId: await world.anAccount() }),
    ];
    const statuses = async () =>
      (await world.storedReports(commentId)).map((row) => row.status);
    return {
      ...world,
      ownerId,
      commentId,
      reports,
      statuses,
      mod1: as(firstMod, 'admin'),
      mod2: as(secondMod, 'admin'),
    };
  };

  test('contract actions: take moves every New report to In review and records the taker', async () => {
    const w = await withReports();
    const settled = await w.aReport(w.commentId, { status: 'dismissed' });
    await w.repository.take(w.commentId, w.mod1);
    assert.deepEqual(await w.statuses(), [
      'in_review',
      'in_review',
      'dismissed',
    ]);
    const state = await w.reportState(w.reports[0]!);
    assert.equal(state.moderatorId, w.mod1.id);
    assert.notEqual(state.takenAt, null);
    assert.equal((await w.reportState(settled)).moderatorId, null);
  });

  test('contract actions: uphold needs In review, then removes the Comment', async () => {
    const w = await withReports();
    await assert.rejects(w.repository.uphold(w.commentId, w.mod1), isConflict);
    await w.repository.take(w.commentId, w.mod1);
    await w.repository.uphold(w.commentId, w.mod2);
    assert.deepEqual(await w.statuses(), ['upheld', 'upheld']);
    const state = await w.reportState(w.reports[0]!);
    assert.equal(state.moderatorId, w.mod2.id, 'whoever acted last');
    assert.notEqual(state.settledAt, null);
    assert.equal(await w.commentTombstone(w.commentId), 'removed');
  });

  test('contract actions: dismiss needs In review, keeps the Comment and stores its text', async () => {
    const w = await withReports();
    await assert.rejects(w.repository.dismiss(w.commentId, w.mod1), isConflict);
    await w.repository.take(w.commentId, w.mod1);
    await w.repository.dismiss(w.commentId, w.mod2);
    assert.deepEqual(await w.statuses(), ['dismissed', 'dismissed']);
    assert.equal(
      (await w.reportState(w.reports[0]!)).settledText,
      await w.textOf(w.commentId)
    );
    assert.equal(await w.commentTombstone(w.commentId), null);
  });

  test('contract actions: a settled Report refuses every action', async () => {
    const w = await withReports();
    await w.repository.take(w.commentId, w.mod1);
    await w.repository.dismiss(w.commentId, w.mod1);
    for (const act of [
      w.repository.take,
      w.repository.uphold,
      w.repository.dismiss,
    ]) {
      await assert.rejects(
        act.call(w.repository, w.commentId, w.mod1),
        isConflict
      );
    }
  });

  test('contract actions: taking twice is a 409', async () => {
    const w = await withReports();
    await w.repository.take(w.commentId, w.mod1);
    await assert.rejects(w.repository.take(w.commentId, w.mod2), isConflict);
  });

  test('contract actions: the Comment’s owner is refused with a 403 and nothing changes', async () => {
    const w = await withReports();
    const owner = as(w.ownerId, 'admin');
    for (const act of [
      w.repository.take,
      w.repository.uphold,
      w.repository.dismiss,
    ]) {
      await assert.rejects(
        act.call(w.repository, w.commentId, owner),
        ForbiddenError
      );
    }
    assert.deepEqual(await w.statuses(), ['new', 'new']);
  });

  test('contract actions: a missing Comment is a 404', async () => {
    const w = await withReports();
    await assert.rejects(w.repository.take(MISSING_ID, w.mod1), NotFoundError);
  });

  test('contract actions: uphold on a Comment that is already a Tombstone keeps its kind', async () => {
    const w = await withReports();
    await w.repository.take(w.commentId, w.mod1);
    await w.setTombstone(w.commentId, 'deleted');
    await w.repository.uphold(w.commentId, w.mod1);
    assert.deepEqual(await w.statuses(), ['upheld', 'upheld']);
    assert.equal(await w.commentTombstone(w.commentId), 'deleted');
  });
}
