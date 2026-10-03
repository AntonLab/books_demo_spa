import {
  fn,
  literal,
  col,
  Op,
  UniqueConstraintError,
  type Sequelize,
  type Transaction,
} from 'sequelize';
import {
  BAN_MARK_THRESHOLD,
  OPEN_REPORT_STATUSES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TOP_ACCOUNTS,
  type ReportRow,
  type ReportStatistics,
  type ReportStatus,
} from 'shared';
import { Comment } from '../models/Comment.ts';
import { Report } from '../models/Report.ts';
import { User } from '../models/User.ts';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  StateConflictError,
} from '../types/errors.ts';
import type {
  CreateReportInput,
  ListReportsQuery,
  ReportRange,
} from '../types/report.ts';
import { joined } from './joined.ts';
import type { Viewer } from './visibility.ts';

// The signed-in account behind a Report. Never a Guest: every route that
// reaches this repository is guarded.
export type Account = NonNullable<Viewer>;

export interface ReportRepository {
  // Errors in this order: NotFoundError('Comment', id); ForbiddenError for the
  // reporter's own Comment; BadRequestError for a Tombstone; StateConflictError
  // (409) when the Comment has an Open report, and the same when the reporter
  // already reported it. The reported Account stored is the Comment's Owner;
  // the status starts 'new'.
  create(
    commentId: number,
    input: CreateReportInput,
    reporter: Account
  ): Promise<{ id: number }>;

  // Reports created in [from, to), newest first (ties by id descending),
  // optionally of one status. `total` counts every match, not the page.
  // `reporter` is null for a System report and a deleted reporter;
  // `reportedAccount` is null once that Account is deleted. `atBanThreshold`:
  // the Account owns at least BAN_MARK_THRESHOLD distinct Comments with an
  // Upheld report (a restored Comment still counts).
  list(
    query: ListReportsQuery,
    viewer: Account
  ): Promise<{ items: ReportRow[]; total: number }>;

  // take, uphold and dismiss act on every Report of the Comment in the state
  // the action needs. Errors in this order: NotFoundError('Comment', id);
  // ForbiddenError when `moderator` owns the Comment; StateConflictError (409)
  // when no Report is in that state (take: 'new'; uphold, dismiss:
  // 'in_review'). Settled Reports are never touched. Each records
  // `moderator` (whoever acts last). `take` moves 'new' to 'in_review' and
  // sets takenAt. `uphold` moves 'in_review' to 'upheld', sets settledAt and
  // the Comment's tombstone to 'removed' only where it is null. `dismiss`
  // moves 'in_review' to 'dismissed', sets settledAt and stores the Comment's
  // current text in settledText.
  take(commentId: number, moderator: Account): Promise<void>;
  uphold(commentId: number, moderator: Account): Promise<void>;
  dismiss(commentId: number, moderator: Account): Promise<void>;

  // `byStatus` and `byReason` count Reports created in [from, to) and carry
  // every key, zero when absent. `topAccounts` ranks reported Accounts by
  // their count of those Reports (count descending, id ascending), at most
  // REPORT_TOP_ACCOUNTS, skipping Reports whose reported Account is deleted.
  // `averageSettleSeconds` is the mean of settledAt - createdAt over Reports
  // settled in [from, to), whenever created; null when there are none.
  statistics(range: ReportRange): Promise<ReportStatistics>;
}

function sequelizeOf(): Sequelize {
  const sequelize = Report.sequelize;
  if (!sequelize) throw new Error('Report model is not initialised');
  return sequelize;
}

const inRange = ({ from, to }: ReportRange) => ({
  [Op.gte]: from,
  [Op.lt]: to,
});

// Locks the Comment row, so every writer of one Comment's Reports takes turns.
async function lockedComment(
  commentId: number,
  transaction: Transaction
): Promise<Comment> {
  const comment = await Comment.findByPk(commentId, {
    attributes: ['id', 'userId', 'text', 'tombstone'],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!comment) throw new NotFoundError('Comment', commentId);
  return comment;
}

// Accounts among `accountIds` that own at least BAN_MARK_THRESHOLD distinct
// Comments with an Upheld report: one grouped query for the whole page.
async function atBanThreshold(accountIds: number[]): Promise<Set<number>> {
  if (accountIds.length === 0) return new Set();
  const rows = await Report.findAll({
    attributes: ['reportedAccountId'],
    where: { reportedAccountId: accountIds, status: 'upheld' },
    group: ['reportedAccountId'],
    having: literal(`COUNT(DISTINCT commentId) >= ${BAN_MARK_THRESHOLD}`),
    raw: true,
  });
  return new Set(rows.flatMap((row) => row.reportedAccountId ?? []));
}

// Grouped counts of the Reports created in the range, keyed by one column.
async function countsBy(
  column: 'status' | 'reason',
  range: ReportRange
): Promise<Map<string, number>> {
  const rows = (await Report.findAll({
    attributes: [column, [fn('COUNT', col('id')), 'count']],
    where: { createdAt: inRange(range) },
    group: [column],
    raw: true,
  })) as unknown as { status?: string; reason?: string; count: number }[];
  return new Map(rows.map((row) => [row[column] ?? '', Number(row.count)]));
}

export function createSequelizeReportRepository(): ReportRepository {
  // The Comment lock makes concurrent callers take turns, so the one that
  // comes second finds no Report in the state `needed` and gets the 409.
  const act = async (
    commentId: number,
    moderator: Account,
    needed: ReportStatus,
    changes: (comment: Comment) => Partial<Report['dataValues']>,
    afterwards?: (transaction: Transaction) => Promise<unknown>
  ) => {
    await sequelizeOf().transaction(async (transaction) => {
      const comment = await lockedComment(commentId, transaction);
      if (comment.userId === moderator.id) throw new ForbiddenError();
      const [affected] = await Report.update(
        { moderatorId: moderator.id, ...changes(comment) },
        { where: { commentId, status: needed }, transaction }
      );
      if (affected === 0) {
        throw new StateConflictError(`Comment has no ${needed} report`);
      }
      await afterwards?.(transaction);
    });
  };

  return {
    async create(commentId, input, reporter) {
      return sequelizeOf().transaction(async (transaction) => {
        const comment = await lockedComment(commentId, transaction);
        if (comment.userId === reporter.id) throw new ForbiddenError();
        if (comment.tombstone) {
          throw new BadRequestError('Comment cannot be reported');
        }
        const existing = await Report.findOne({
          attributes: ['id'],
          where: {
            commentId,
            [Op.or]: [
              { status: [...OPEN_REPORT_STATUSES] },
              { reporterId: reporter.id },
            ],
          },
          transaction,
        });
        if (existing)
          throw new StateConflictError('Comment is already reported');
        try {
          const { id } = await Report.create(
            {
              commentId,
              reporterId: reporter.id,
              reportedAccountId: comment.userId,
              reason: input.reason,
              explanation: input.explanation,
            },
            { transaction }
          );
          return { id };
        } catch (error) {
          // The unique index is the last line of defence behind the lock.
          if (error instanceof UniqueConstraintError) {
            throw new StateConflictError('Comment is already reported');
          }
          throw error;
        }
      });
    },

    async list(query, viewer) {
      const { rows, count } = await Report.findAndCountAll({
        where: {
          createdAt: inRange(query),
          ...(query.status && { status: query.status }),
        },
        include: [
          {
            model: Comment,
            as: 'comment',
            attributes: ['id', 'bookId', 'text', 'tombstone', 'userId'],
            required: true,
          },
          { model: User, as: 'reporter', attributes: ['id', 'login'] },
          { model: User, as: 'moderator', attributes: ['id', 'login'] },
          {
            model: User,
            as: 'reportedAccount',
            attributes: ['id', 'login', 'status', 'role'],
          },
        ],
        distinct: true,
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: query.limit,
        offset: query.offset,
      });
      const banned = await atBanThreshold(
        rows.flatMap((row) => row.reportedAccountId ?? [])
      );
      return {
        items: rows.map((row): ReportRow => {
          const comment = joined(row.comment);
          const { reporter, reportedAccount, moderator } = row;
          return {
            id: row.id,
            createdAt: row.createdAt,
            reporter: reporter
              ? { id: reporter.id, login: reporter.login }
              : null,
            isSystem: row.isSystem,
            reason: row.reason,
            explanation: row.explanation,
            reportedAccount: reportedAccount
              ? {
                  id: reportedAccount.id,
                  login: reportedAccount.login,
                  status: reportedAccount.status,
                  role: reportedAccount.role,
                  atBanThreshold: banned.has(reportedAccount.id),
                }
              : null,
            comment: {
              id: comment.id,
              bookId: comment.bookId,
              text: comment.tombstone ? '' : comment.text,
              tombstone: comment.tombstone ?? null,
            },
            status: row.status,
            moderatorId: moderator?.id ?? null,
            moderatorLogin: moderator?.login ?? null,
            isOwnComment: comment.userId === viewer.id,
          };
        }),
        total: count,
      };
    },

    async take(commentId, moderator) {
      await act(commentId, moderator, 'new', () => ({
        status: 'in_review',
        takenAt: new Date(),
      }));
    },

    async uphold(commentId, moderator) {
      await act(
        commentId,
        moderator,
        'in_review',
        () => ({ status: 'upheld', settledAt: new Date() }),
        (transaction) =>
          Comment.update(
            { tombstone: 'removed' },
            { where: { id: commentId, tombstone: null }, transaction }
          )
      );
    },

    async dismiss(commentId, moderator) {
      await act(commentId, moderator, 'in_review', (comment) => ({
        status: 'dismissed',
        settledAt: new Date(),
        settledText: comment.text,
      }));
    },

    async statistics(range) {
      const [byStatus, byReason, top, average] = await Promise.all([
        countsBy('status', range),
        countsBy('reason', range),
        Report.findAll({
          attributes: ['reportedAccountId', [fn('COUNT', col('id')), 'count']],
          where: {
            createdAt: inRange(range),
            reportedAccountId: { [Op.ne]: null },
          },
          group: ['reportedAccountId'],
          order: [
            [literal('count'), 'DESC'],
            ['reportedAccountId', 'ASC'],
          ],
          limit: REPORT_TOP_ACCOUNTS,
          raw: true,
        }) as unknown as Promise<
          { reportedAccountId: number; count: number }[]
        >,
        Report.findAll({
          attributes: [
            [
              fn(
                'AVG',
                fn(
                  'TIMESTAMPDIFF',
                  literal('SECOND'),
                  col('createdAt'),
                  col('settledAt')
                )
              ),
              'average',
            ],
          ],
          where: { settledAt: inRange(range) },
          raw: true,
        }) as unknown as Promise<{ average: string | null }[]>,
      ]);
      const logins = new Map(
        (
          await User.findAll({
            attributes: ['id', 'login'],
            where: { id: top.map((row) => row.reportedAccountId) },
          })
        ).map((user) => [user.id, user.login])
      );
      const average0 = average[0]?.average ?? null;
      return {
        byStatus: Object.fromEntries(
          REPORT_STATUSES.map((status) => [status, byStatus.get(status) ?? 0])
        ) as ReportStatistics['byStatus'],
        byReason: Object.fromEntries(
          REPORT_REASONS.map((reason) => [reason, byReason.get(reason) ?? 0])
        ) as ReportStatistics['byReason'],
        topAccounts: top.map((row) => ({
          id: row.reportedAccountId,
          login: logins.get(row.reportedAccountId) ?? '',
          count: Number(row.count),
        })),
        averageSettleSeconds: average0 === null ? null : Number(average0),
      };
    },
  };
}
