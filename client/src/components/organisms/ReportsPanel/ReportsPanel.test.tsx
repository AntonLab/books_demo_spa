import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportsPanel } from './ReportsPanel';
import { ApiError } from '@/api/client';
import * as reportsApi from '@/api/reports';
import { queryKeys } from '@/queries/keys';
import { createTestQueryClient } from '@/test/queryClient';
import { renderWithProviders } from '@/test/renderWithProviders';
import { reportRow } from '@/test/reports';
import type { QueryClient } from '@tanstack/react-query';
import type { ReportRow } from '@/types/api';

jest.mock('@/api/reports');
const mockedReports = jest.mocked(reportsApi);

const listOf = (items: ReportRow[], total = items.length) => ({
  items,
  total,
  limit: 20,
  offset: 0,
});

const renderPanel = (queryClient: QueryClient = createTestQueryClient()) =>
  renderWithProviders(<ReportsPanel />, { queryClient });

describe('ReportsPanel', () => {
  describe('with the clock at 2026-10-03 15:30', () => {
    beforeEach(() =>
      jest.useFakeTimers({
        now: new Date(2026, 9, 3, 15, 30),
        doNotFake: [
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'setImmediate',
          'clearImmediate',
          'nextTick',
          'queueMicrotask',
        ],
      })
    );
    afterEach(() => jest.useRealTimers());

    it('asks for today by default: this local midnight to the next', async () => {
      mockedReports.listReports.mockResolvedValue(listOf([]));
      renderPanel();
      await waitFor(() =>
        expect(mockedReports.listReports).toHaveBeenCalledWith({
          from: new Date(2026, 9, 3).toISOString(),
          to: new Date(2026, 9, 4).toISOString(),
          limit: 20,
          offset: 0,
        })
      );
    });
  });

  it('renders a report row with every column', async () => {
    mockedReports.listReports.mockResolvedValue(
      listOf([reportRow({ explanation: 'Too loud', moderatorLogin: null })])
    );
    renderPanel();
    const row = await screen.findByRole('row', { name: /Reader/ });
    expect(within(row).getByText('Spam')).toBeInTheDocument();
    expect(within(row).getByText('Too loud')).toBeInTheDocument();
    expect(within(row).getByText('Writer')).toBeInTheDocument();
    expect(within(row).getByText('New')).toBeInTheDocument();
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(
      within(row).getByRole('link', { name: 'Open book' })
    ).toHaveAttribute('href', '/books/1');
  });

  it('names a System report, and a deleted reporter or Account, without crashing', async () => {
    mockedReports.listReports.mockResolvedValue(
      listOf([
        reportRow({ id: 1, reporter: null, isSystem: true }),
        reportRow({
          id: 2,
          reporter: null,
          isSystem: false,
          reportedAccount: null,
          comment: { id: 6, bookId: 1, text: 'x', tombstone: null },
        }),
      ])
    );
    renderPanel();
    expect(await screen.findByText('System')).toBeInTheDocument();
    expect(screen.getAllByText('Deleted account')).toHaveLength(2);
  });

  it('shows the Tombstone label instead of the text of a Removed comment', async () => {
    mockedReports.listReports.mockResolvedValue(
      listOf([
        reportRow({
          comment: { id: 5, bookId: 1, text: '', tombstone: 'removed' },
        }),
      ])
    );
    renderPanel();
    expect(
      await screen.findByText('[removed by moderator]')
    ).toBeInTheDocument();
  });

  it('highlights every report of the same comment together, on hover and on focus', async () => {
    mockedReports.listReports.mockResolvedValue(
      listOf([
        reportRow({ id: 1 }),
        reportRow({ id: 2, reporter: { id: 8, login: 'Second' } }),
        reportRow({
          id: 3,
          comment: { id: 9, bookId: 1, text: 'other', tombstone: null },
        }),
      ])
    );
    const { container } = renderPanel();
    await screen.findByText('Second');
    const row = (id: number) =>
      container.querySelector<HTMLElement>(`tr[data-row-key="${id}"]`)!;

    await userEvent.hover(row(1));
    expect(row(1)).toHaveAttribute('data-highlighted', 'true');
    expect(row(2)).toHaveAttribute('data-highlighted', 'true');
    expect(row(3)).not.toHaveAttribute('data-highlighted', 'true');

    await userEvent.unhover(row(1));
    expect(row(2)).not.toHaveAttribute('data-highlighted', 'true');

    act(() => within(row(2)).getAllByRole('link')[0]!.focus());
    expect(row(1)).toHaveAttribute('data-highlighted', 'true');
  });

  it('filters by status and returns to page 1', async () => {
    mockedReports.listReports.mockResolvedValue(listOf([reportRow()], 45));
    renderPanel();
    await screen.findByText('Writer');
    await userEvent.click(screen.getByRole('listitem', { name: '2' }));
    await waitFor(() =>
      expect(mockedReports.listReports).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 20 })
      )
    );

    await userEvent.click(
      screen.getByRole('combobox', { name: 'Status filter' })
    );
    await userEvent.click(await screen.findByTitle('In review'));

    await waitFor(() =>
      expect(mockedReports.listReports).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'in_review', offset: 0 })
      )
    );
  });

  it('falls back to the last page that still has rows when the current one empties', async () => {
    const queryClient = createTestQueryClient();
    mockedReports.listReports.mockResolvedValue(listOf([reportRow()], 21));
    renderPanel(queryClient);
    await screen.findByText('Writer');
    await userEvent.click(screen.getByRole('listitem', { name: '2' }));
    await waitFor(() =>
      expect(mockedReports.listReports).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 20 })
      )
    );

    // The one row of page 2 was settled elsewhere: page 2 is now empty, the total 20.
    mockedReports.listReports.mockImplementation(async ({ offset }) =>
      listOf(
        offset === 0
          ? [reportRow({ id: 7, reporter: { id: 2, login: 'Survivor' } })]
          : [],
        20
      )
    );
    await act(() =>
      queryClient.invalidateQueries({ queryKey: queryKeys.allReports })
    );

    expect(await screen.findByText('Survivor')).toBeInTheDocument();
  });

  it('shows an empty message, a failure alert and no table on error', async () => {
    mockedReports.listReports.mockResolvedValue(listOf([]));
    const { unmount } = renderPanel();
    expect(
      await screen.findByText('No reports in this range.')
    ).toBeInTheDocument();
    unmount();

    mockedReports.listReports.mockRejectedValue(new ApiError(500, 'boom'));
    renderPanel();
    expect(
      await screen.findByText('Could not load the reports.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
