import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeriesOrderList } from './SeriesOrderList';
import { renderWithProviders } from '@/test/renderWithProviders';
import { layOutSortableRows, moveWithKeyboard } from '@/test/sortable';
import { ApiError } from '@/api/client';
import * as seriesApi from '@/api/series';
import type { PublicUser, SeriesBookSummary } from '@/types/api';

jest.mock('@/api/series');

const mockedSeries = jest.mocked(seriesApi);

const ann = {
  id: 3,
  login: 'ann',
  firstName: 'Ann',
  lastName: 'Author',
  avatarUrl: null,
};
const cora = {
  id: 4,
  login: 'cora',
  firstName: 'Cora',
  lastName: 'Writer',
  avatarUrl: null,
};

const sessionOf = (role: PublicUser['role']): PublicUser => ({
  ...ann,
  email: 'ann@example.com',
  role,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const bookNamed = (
  id: number,
  title: string,
  status: SeriesBookSummary['status'] = 'complete',
  authors = [ann]
): SeriesBookSummary => ({ id, title, status, authors });

const listing = (items: SeriesBookSummary[]) => ({ items });

const renderList = (
  overrides: Partial<{
    mayEdit: boolean;
    session: PublicUser;
  }> = {}
) =>
  renderWithProviders(
    <SeriesOrderList
      seriesId={7}
      mayEdit
      session={sessionOf('author')}
      {...overrides}
    />
  );

beforeEach(() => {
  jest.resetAllMocks();
  mockedSeries.listSeriesBooks.mockResolvedValue(listing([]));
});

describe('SeriesOrderList', () => {
  it('lists each book with its status and its authors, linked to its page', async () => {
    mockedSeries.listSeriesBooks.mockResolvedValue(
      listing([bookNamed(1, 'A Tale of Dragons', 'complete', [ann, cora])])
    );
    renderList();

    expect(
      await screen.findByRole('link', { name: 'A Tale of Dragons' })
    ).toHaveAttribute('href', '/books/1');
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('Ann Author, Cora Writer')).toBeInTheDocument();
  });

  it('names rather than links a draft the viewer may not read', async () => {
    mockedSeries.listSeriesBooks.mockResolvedValue(
      listing([bookNamed(2, 'Someone Else’s Draft', 'draft', [cora])])
    );
    renderList();

    expect(await screen.findByText('Someone Else’s Draft')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Someone Else’s Draft' })
    ).toBeNull();
  });

  it('opens that same draft for a moderator', async () => {
    mockedSeries.listSeriesBooks.mockResolvedValue(
      listing([bookNamed(2, 'Someone Else’s Draft', 'draft', [cora])])
    );
    renderList({ session: { ...sessionOf('admin'), id: 99 } });

    expect(
      await screen.findByRole('link', { name: 'Someone Else’s Draft' })
    ).toHaveAttribute('href', '/books/2');
  });

  it('asks for no books at all until the viewer is known to be allowed to edit', () => {
    renderList({ mayEdit: false });

    expect(mockedSeries.listSeriesBooks).not.toHaveBeenCalled();
  });

  it('takes a book out of the series only once that is confirmed', async () => {
    mockedSeries.listSeriesBooks.mockResolvedValue(
      listing([bookNamed(1, 'A Tale of Dragons')])
    );
    mockedSeries.removeBookFromSeries.mockResolvedValue(undefined);
    renderList();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove from series' })
    );
    expect(mockedSeries.removeBookFromSeries).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Take it out' }));

    await waitFor(() =>
      expect(mockedSeries.removeBookFromSeries).toHaveBeenCalledWith(7, 1)
    );
  });

  it('on a conflict says why the order changed', async () => {
    const restoreLayout = layOutSortableRows();
    try {
      mockedSeries.reorderSeriesBooks.mockRejectedValue(
        new ApiError(
          409,
          'The books of this series changed since you loaded them'
        )
      );
      mockedSeries.listSeriesBooks
        .mockResolvedValueOnce(
          listing([bookNamed(1, 'One'), bookNamed(2, 'Two')])
        )
        .mockResolvedValue(listing([bookNamed(1, 'One'), bookNamed(2, 'Two')]));
      renderList();

      await moveWithKeyboard(
        await screen.findByRole('button', { name: 'Reorder One' }),
        'ArrowDown'
      );

      expect(mockedSeries.reorderSeriesBooks).toHaveBeenCalledWith(7, [2, 1]);
      expect(
        await screen.findByText(
          'A co-author changed the books of this series while you were reordering them. This is their current order.'
        )
      ).toBeInTheDocument();
    } finally {
      restoreLayout();
    }
  });
});
