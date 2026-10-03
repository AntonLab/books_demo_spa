import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReportReason, ReportStatus, Tombstone, UserRole } from 'shared';
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../types/errors.ts';
import type { Account, ReportRepository } from './reportRepository.ts';

// An id no row in either implementation has.
export const MISSING_ID = 999_999;
export const as = (id: number, role: UserRole = 'user'): Account => ({
  id,
  role,
});
export const SPAM = { reason: 'spam' as const, explanation: null };
export const isConflict = (error: unknown) =>
  error instanceof AppError && error.statusCode === 409;

export interface StoredReport {
  id: number;
  status: ReportStatus;
  reason: ReportReason;
  explanation: string | null;
  reporterId: number | null;
  reportedAccountId: number | null;
  isSystem: boolean;
}

// What a contract case needs besides the repository: the rows it assumes
// exist. The MySQL side writes them to the database, the fake side into its maps.
export interface ReportContractWorld {
  repository: ReportRepository;
  anAccount(): Promise<number>;
  // A live Comment owned by `ownerId`, on a Published Book.
  aComment(ownerId: number): Promise<number>;
  setTombstone(commentId: number, kind: Tombstone | null): Promise<void>;
  // Every Report of the Comment, oldest first.
  storedReports(commentId: number): Promise<StoredReport[]>;
}

// Registers the create cases every ReportRepository must pass. Called from the
// fake spec and from the MySQL spec.
export function reportCreateContract(
  setUp: () => Promise<ReportContractWorld>
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

  test('contract: a Report starts New and records its reporter and the Comment owner', async () => {
    const { repository, ownerId, reporterId, commentId, storedReports } =
      await withComment();
    const { id } = await repository.create(
      commentId,
      { reason: 'other', explanation: 'rude' },
      as(reporterId)
    );
    assert.deepEqual(await storedReports(commentId), [
      {
        id,
        status: 'new',
        reason: 'other',
        explanation: 'rude',
        reporterId,
        reportedAccountId: ownerId,
        isSystem: false,
      },
    ]);
  });

  test('contract: a missing Comment is a 404 and one’s own Comment a 403', async () => {
    const { repository, ownerId, reporterId, commentId } = await withComment();
    await assert.rejects(
      repository.create(MISSING_ID, SPAM, as(reporterId)),
      NotFoundError
    );
    await assert.rejects(
      repository.create(commentId, SPAM, as(ownerId)),
      ForbiddenError
    );
  });

  test('contract: a Tombstone of either kind cannot be reported', async () => {
    const { repository, reporterId, commentId, setTombstone, storedReports } =
      await withComment();
    for (const kind of ['deleted', 'removed'] as const) {
      await setTombstone(commentId, kind);
      await assert.rejects(
        repository.create(commentId, SPAM, as(reporterId)),
        BadRequestError
      );
    }
    assert.deepEqual(await storedReports(commentId), []);
  });

  test('contract: a Comment with an Open report refuses a second Report, from anyone', async () => {
    const { repository, reporterId, commentId, anAccount, storedReports } =
      await withComment();
    await repository.create(commentId, SPAM, as(reporterId));
    await assert.rejects(
      repository.create(commentId, SPAM, as(reporterId)),
      isConflict
    );
    await assert.rejects(
      repository.create(commentId, SPAM, as(await anAccount())),
      isConflict
    );
    assert.equal((await storedReports(commentId)).length, 1);
  });

  test('contract: an Open report on one Comment does not block another', async () => {
    const {
      repository,
      ownerId,
      reporterId,
      commentId,
      aComment,
      storedReports,
    } = await withComment();
    const second = await aComment(ownerId);
    await repository.create(commentId, SPAM, as(reporterId));
    await repository.create(second, SPAM, as(reporterId));
    assert.equal((await storedReports(second)).length, 1);
  });
}
