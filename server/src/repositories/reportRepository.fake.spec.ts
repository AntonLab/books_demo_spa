import { describe } from 'node:test';
import {
  reportActionsContract,
  type ReportActionsWorld,
} from './reportRepository.actions.contract.testkit.ts';
import { reportCreateContract } from './reportRepository.contract.testkit.ts';
import { reportListContract } from './reportRepository.list.contract.testkit.ts';
import { reportStatisticsContract } from './reportRepository.statistics.contract.testkit.ts';
import {
  createFakeReportRepository,
  type FakeAccount,
  type FakeComment,
  type FakeReport,
} from './reportRepository.fake.testkit.ts';

describe('the fake reportRepository', () => {
  const setUp = async (): Promise<ReportActionsWorld> => {
    const accounts = new Map<number, FakeAccount>();
    const comments = new Map<number, FakeComment>();
    const rows: FakeReport[] = [];
    return {
      async aReport(commentId, fields = {}) {
        const comment = comments.get(commentId);
        const id = Math.max(0, ...rows.map((row) => row.id)) + 1;
        rows.push({
          id,
          commentId,
          reporterId: null,
          isSystem: false,
          reportedAccountId: comment?.userId ?? null,
          reason: 'spam',
          explanation: null,
          status: 'new',
          moderatorId: null,
          settledText: null,
          takenAt: null,
          settledAt: null,
          createdAt: new Date(),
          ...fields,
        });
        return id;
      },
      async deleteAccount(id) {
        accounts.delete(id);
        for (const row of rows) {
          if (row.reporterId === id) row.reporterId = null;
          if (row.reportedAccountId === id) row.reportedAccountId = null;
          if (row.moderatorId === id) row.moderatorId = null;
        }
        for (const comment of comments.values()) {
          if (comment.userId === id) comment.userId = null;
        }
      },
      async loginOf(id) {
        return accounts.get(id)?.login ?? '';
      },
      async bookIdOf(commentId) {
        return comments.get(commentId)?.bookId ?? 0;
      },
      async textOf(commentId) {
        return comments.get(commentId)?.text ?? '';
      },
      repository: createFakeReportRepository({ accounts, comments, rows }),
      async anAccount() {
        const id = accounts.size + 1;
        accounts.set(id, {
          login: `Account${id}`,
          status: 'active',
          role: 'user',
        });
        return id;
      },
      async aComment(ownerId: number) {
        const id = comments.size + 1;
        comments.set(id, {
          id,
          userId: ownerId,
          bookId: 1,
          text: `Comment ${id}`,
          tombstone: null,
        });
        return id;
      },
      async setTombstone(commentId: number, kind: FakeComment['tombstone']) {
        const comment = comments.get(commentId);
        if (comment) comment.tombstone = kind;
      },
      async commentTombstone(commentId: number) {
        return comments.get(commentId)?.tombstone ?? null;
      },
      async reportState(reportId: number) {
        const row = rows.find((candidate) => candidate.id === reportId);
        return {
          moderatorId: row?.moderatorId ?? null,
          takenAt: row?.takenAt ?? null,
          settledAt: row?.settledAt ?? null,
          settledText: row?.settledText ?? null,
        };
      },
      async storedReports(commentId: number) {
        return rows
          .filter((row) => row.commentId === commentId)
          .map(
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
    };
  };
  reportCreateContract(setUp);
  reportListContract(setUp);
  reportActionsContract(setUp);
  reportStatisticsContract(setUp);
});
