import { useState, type FC } from 'react';
import { Link } from 'react-router';
import {
  Alert,
  DatePicker,
  Flex,
  Select,
  Skeleton,
  Table,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { REPORT_STATUSES } from 'shared';
import type { ReportStatus } from 'shared';
import { ListPagination } from '@/components/molecules/ListPagination/ListPagination';
import { TOMBSTONE_LABELS } from '@/components/molecules/Comment/Comment';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import { formatDateTime } from '@/format/date';
import { ApiError } from '@/api/client';
import { ReportStatisticsView } from '@/components/molecules/ReportStatisticsView/ReportStatisticsView';
import { NameLink } from '@/components/molecules/NameLink/NameLink';
import { ReportActions } from '@/components/molecules/ReportActions/ReportActions';
import { ReportedAccountCell } from '@/components/molecules/ReportedAccountCell/ReportedAccountCell';
import { useSession } from '@/queries/auth';
import {
  useBanAccount,
  useDismissReport,
  useReports,
  useReportStatistics,
  useTakeReport,
  useUpholdReport,
} from '@/queries/reports';
import spacing from '@/theme/spacing.module.css';
import { banBlockedReason } from '@/types/banReach';
import { REASON_LABELS, STATUS_LABELS } from '@/types/report';
import { dayRange } from '@/types/reportRange';
import type { ReportRow } from '@/types/api';
import styles from './ReportsPanel.module.css';

const STATUS_OPTIONS = [
  { value: undefined, label: 'All' },
  ...REPORT_STATUSES.map((value) => ({
    value,
    label: STATUS_LABELS[value],
  })),
];

const accountLogin = (account: { login: string } | null): string =>
  account?.login ?? 'Deleted account';

const reporterName = (row: ReportRow): string =>
  row.isSystem ? 'System' : accountLogin(row.reporter);

export const ReportsPanel: FC = () => {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [dayjs(), dayjs()]);
  const [status, setStatus] = useState<ReportStatus | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [activeCommentId, setActiveCommentId] = useState<number | null>(null);

  const { data, isError, isFetching } = useReports({
    ...dayRange(...range),
    ...(status === undefined ? {} : { status }),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const statistics = useReportStatistics(dayRange(...range));

  const { data: session } = useSession();
  const take = useTakeReport();
  const uphold = useUpholdReport();
  const dismiss = useDismissReport();
  const ban = useBanAccount();
  const busy = [take, uphold, dismiss, ban].some((m) => m.isPending);
  const failure = [take, uphold, dismiss, ban].find((m) => m.isError)?.error;

  // Resets all four first, so only the latest failure shows.
  const run = <V,>(
    mutation: { mutate: (variables: V) => void },
    variables: V
  ) => {
    [take, uphold, dismiss, ban].forEach((m) => m.reset());
    mutation.mutate(variables);
  };

  // A page emptied from elsewhere (its last report settled) steps back to the
  // last page that still has rows.
  if (data && data.items.length === 0 && page > 1) {
    setPage(Math.max(1, Math.ceil(data.total / pageSize)));
  }

  return (
    <>
      <Flex gap="small" wrap className={spacing.gapBelow}>
        <DatePicker.RangePicker
          allowClear={false}
          id={{ start: 'reports-from', end: 'reports-to' }}
          value={range}
          onChange={(value) => {
            if (value?.[0] && value[1]) {
              setRange([value[0], value[1]]);
              setPage(1);
            }
          }}
        />
        <Select
          id="reports-status-filter"
          aria-label="Status filter"
          style={{ minWidth: 140 }}
          options={STATUS_OPTIONS}
          value={status}
          onChange={(value: ReportStatus | undefined) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Flex>
      <div className={spacing.gapBelow}>
        {statistics.isError ? (
          <Alert type="error" title="Could not load the statistics." />
        ) : statistics.data ? (
          <ReportStatisticsView statistics={statistics.data} />
        ) : (
          <Skeleton active />
        )}
      </div>
      {failure && (
        <Alert
          type="error"
          className={spacing.gapBelow}
          title={
            failure instanceof ApiError
              ? failure.message
              : 'Could not complete the action.'
          }
        />
      )}
      {isError ? (
        <Alert type="error" title="Could not load the reports." />
      ) : (
        <>
          <Table<ReportRow>
            rowKey="id"
            className={styles.table}
            pagination={false}
            loading={isFetching}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: 'No reports in this range.' }}
            dataSource={data?.items}
            onRow={(row) => ({
              ...(row.comment.id === activeCommentId
                ? { 'data-highlighted': true }
                : {}),
              onMouseEnter: () => setActiveCommentId(row.comment.id),
              onMouseLeave: () => setActiveCommentId(null),
              onFocus: () => setActiveCommentId(row.comment.id),
              onBlur: () => setActiveCommentId(null),
            })}
            columns={[
              {
                title: 'Date',
                dataIndex: 'createdAt',
                render: formatDateTime,
              },
              {
                title: 'Reporter',
                render: (_, row) =>
                  row.isSystem || row.reporter === null ? (
                    reporterName(row)
                  ) : (
                    <NameLink id={row.reporter.id} name={row.reporter.login} />
                  ),
              },
              {
                title: 'Reason',
                render: (_, row) => (
                  <>
                    {REASON_LABELS[row.reason]}
                    {row.explanation && (
                      <div>
                        <Typography.Text type="secondary">
                          {row.explanation}
                        </Typography.Text>
                      </div>
                    )}
                  </>
                ),
              },
              {
                title: 'Reported account',
                render: (_, { reportedAccount }) => (
                  <ReportedAccountCell
                    account={reportedAccount}
                    blockedReason={
                      reportedAccount &&
                      banBlockedReason(session, reportedAccount)
                    }
                    pending={busy}
                    onBan={() =>
                      reportedAccount && run(ban, reportedAccount.id)
                    }
                  />
                ),
              },
              {
                title: 'Comment',
                render: (_, row) => (
                  <>
                    {row.comment.tombstone === null ? (
                      <Typography.Paragraph
                        ellipsis={{ rows: 3 }}
                        style={{ marginBottom: 0 }}
                      >
                        {row.comment.text}
                      </Typography.Paragraph>
                    ) : (
                      <Typography.Text type="secondary" italic>
                        {TOMBSTONE_LABELS[row.comment.tombstone]}
                      </Typography.Text>
                    )}
                    <div>
                      <Link to={`/books/${row.comment.bookId}`}>Open book</Link>
                    </div>
                  </>
                ),
              },
              {
                title: 'Status',
                render: (_, row) => STATUS_LABELS[row.status],
              },
              {
                title: 'Moderator',
                render: (_, row) =>
                  row.moderatorId !== null && row.moderatorLogin !== null ? (
                    <NameLink id={row.moderatorId} name={row.moderatorLogin} />
                  ) : (
                    '—'
                  ),
              },
              {
                title: 'Actions',
                render: (_, row) => {
                  const target = {
                    commentId: row.comment.id,
                    bookId: row.comment.bookId,
                  };
                  return (
                    <ReportActions
                      status={row.status}
                      isOwnComment={row.isOwnComment}
                      disabled={busy}
                      onTake={() => run(take, target)}
                      onUphold={() => run(uphold, target)}
                      onDismiss={() => run(dismiss, target)}
                    />
                  );
                },
              },
            ]}
          />
          <ListPagination
            current={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onChange={(p, size) => {
              setPage(p);
              setPageSize(size);
            }}
          />
        </>
      )}
    </>
  );
};
