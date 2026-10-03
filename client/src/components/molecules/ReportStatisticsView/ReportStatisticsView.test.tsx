import { render, screen, within } from '@testing-library/react';
import { ReportStatisticsView } from './ReportStatisticsView';
import { emptyStatistics } from '@/test/reports';
import type { ReportStatistics } from '@/types/api';

const stats: ReportStatistics = {
  byStatus: { new: 3, in_review: 4, upheld: 5, dismissed: 6 },
  byReason: { spam: 7, harassment: 8, spoilers: 9, other: 10 },
  topAccounts: [
    { id: 4, login: 'Writer', count: 12 },
    { id: 5, login: 'Poster', count: 2 },
  ],
  averageSettleSeconds: 5400,
};

describe('ReportStatisticsView', () => {
  it('shows a count for every status and every reason', () => {
    render(<ReportStatisticsView statistics={stats} />);
    const byStatus = within(screen.getByRole('region', { name: 'By status' }));
    expect(byStatus.getByText('In review')).toBeInTheDocument();
    expect(byStatus.getByText('4')).toBeInTheDocument();
    const byReason = within(screen.getByRole('region', { name: 'By reason' }));
    expect(byReason.getByText('Harassment')).toBeInTheDocument();
    expect(byReason.getByText('8')).toBeInTheDocument();
  });

  it('lists the most reported Accounts with their counts, in the given order', () => {
    render(<ReportStatisticsView statistics={stats} />);
    const rows = within(
      screen.getByRole('region', { name: 'Most reported accounts' })
    ).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Writer');
    expect(rows[1]).toHaveTextContent('12');
    expect(rows[2]).toHaveTextContent('Poster');
  });

  it('shows the average time to settle', () => {
    render(<ReportStatisticsView statistics={stats} />);
    expect(
      within(
        screen.getByRole('region', { name: 'Average time to settle' })
      ).getByText('1 h 30 min')
    ).toBeInTheDocument();
  });

  it('shows zeros, an empty list and an em dash for an empty range, never NaN', () => {
    const { container } = render(
      <ReportStatisticsView statistics={emptyStatistics()} />
    );
    expect(container).not.toHaveTextContent('NaN');
    expect(
      within(screen.getByRole('region', { name: 'By status' })).getAllByText(
        '0'
      )
    ).toHaveLength(4);
    expect(screen.getByText('No reported accounts.')).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: 'Average time to settle' })
      ).getByText('—')
    ).toBeInTheDocument();
  });
});
