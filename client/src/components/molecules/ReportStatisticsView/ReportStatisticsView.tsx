import type { FC } from 'react';
import { Statistic, Table } from 'antd';
import { REPORT_REASONS, REPORT_STATUSES } from 'shared';
import { formatDuration } from '@/format/duration';
import { REASON_LABELS, STATUS_LABELS } from '@/types/report';
import type { ReportStatistics } from '@/types/api';
import styles from './ReportStatisticsView.module.css';

interface Props {
  statistics: ReportStatistics;
}

export const ReportStatisticsView: FC<Props> = ({ statistics }) => (
  <div className={styles.grid}>
    <section aria-label="By status" className={styles.counts}>
      {REPORT_STATUSES.map((status) => (
        <Statistic
          key={status}
          title={STATUS_LABELS[status]}
          value={statistics.byStatus[status]}
        />
      ))}
    </section>
    <section aria-label="By reason" className={styles.counts}>
      {REPORT_REASONS.map((reason) => (
        <Statistic
          key={reason}
          title={REASON_LABELS[reason]}
          value={statistics.byReason[reason]}
        />
      ))}
    </section>
    <section aria-label="Most reported accounts">
      <Table
        aria-label="Reported accounts ranking"
        size="small"
        pagination={false}
        rowKey="id"
        locale={{ emptyText: 'No reported accounts.' }}
        dataSource={statistics.topAccounts}
        columns={[
          { title: 'Account', dataIndex: 'login' },
          { title: 'Reports', dataIndex: 'count' },
        ]}
      />
    </section>
    <section aria-label="Average time to settle">
      <Statistic
        title="Average time to settle"
        value={formatDuration(statistics.averageSettleSeconds)}
      />
    </section>
  </div>
);
