import { useState, type FC } from 'react';
import { Link } from 'react-router';
import { Alert, DatePicker, Flex, Select, Table, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { REPORT_STATUSES } from 'shared';
import type { ReportStatus } from 'shared';
import { ListPagination } from '@/components/molecules/ListPagination/ListPagination';
import { TOMBSTONE_LABELS } from '@/components/molecules/Comment/Comment';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import { formatDateTime } from '@/format/date';
import { useReports } from '@/queries/reports';
import spacing from '@/theme/spacing.module.css';
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
                render: (_, row) => reporterName(row),
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
                render: (_, row) => accountLogin(row.reportedAccount),
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
                render: (_, row) => row.moderatorLogin ?? '—',
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
