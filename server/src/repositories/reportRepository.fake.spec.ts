import { describe } from 'node:test';
import { reportCreateContract } from './reportRepository.contract.testkit.ts';
import {
  createFakeReportRepository,
  type FakeAccount,
  type FakeComment,
  type FakeReport,
} from './reportRepository.fake.testkit.ts';

describe('the fake reportRepository', () => {
  const setUp = async () => {
    const accounts = new Map<number, FakeAccount>();
    const comments = new Map<number, FakeComment>();
    const rows: FakeReport[] = [];
    return {
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
});
