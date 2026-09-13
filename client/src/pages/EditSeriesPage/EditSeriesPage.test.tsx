import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { EditSeriesPage } from './EditSeriesPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { layOutSortableRows, moveWithKeyboard } from '@/test/sortable';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as authorsApi from '@/api/authors';
import * as seriesApi from '@/api/series';
import type { PublicSeries, SeriesBookSummary } from '@/types/series';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/authors');
jest.mock('@/api/series');

const mockedAuthors = jest.mocked(authorsApi);
const mockedSeries = jest.mocked(seriesApi);

const ann = { id: 3, login: 'ann', firstName: 'Ann', lastName: 'Author' };
const cora = { id: 4, login: 'cora', firstName: 'Cora', lastName: 'Writer' };

const series: PublicSeries = {
  id: 12,
  authors: [ann, cora],
  title: 'The Scale Cycle',
  description: 'Dragons, in four parts.',
  tags: ['epic'],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const book = (
  id: number,
  title: string,
  status: SeriesBookSummary['status'] = 'complete',
  authors = [ann]
): SeriesBookSummary => ({ id, title, status, authors });

const first = book(1, 'Hatchling');
const second = book(2, 'Wyrm');
const coraDraft = book(3, 'Cora’s Draft', 'draft', [cora]);

const account = (overrides: Partial<PublicUser> = {}): PublicUser => ({
  id: ann.id,
  login: 'ann',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Author',
  status: 'active',
  role: 'author',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const renderPage = (session: PublicUser | null = account()) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);

  return renderWithProviders(
    <Routes>
      <Route path="/series/:id/edit" element={<EditSeriesPage />} />
      <Route path="/my-books" element={<p>My books list</p>} />
      <Route path="/" element={<p>Main page</p>} />
    </Routes>,
    { route: '/series/12/edit', queryClient }
  );
};

// This page carries antd's full stylesheet into jsdom, and there the first
// *ByRole query after any DOM change costs about a third of a second — the
// accessible-name computation calls getComputedStyle over and over. A
// findBy*Role retries that on every change, so on a slower CI runner it could
// try once before its one-second timeout and fail with the page still loading.
// So these tests wait on text, which costs a millisecond, and ask for a role
// once the page has settled.
const booksLoaded = () => screen.findByText('Wyrm');

// Even so, each test here spends most of a second locally on the role queries
// the drag handles need — they are labelled, with no text to find them by —
// and CI runs this file about 2.5 times slower, close to Jest's 5 s default.
jest.setTimeout(10_000);

const bookTitlesOnScreen = () =>
  screen
    .getAllByRole('button', { name: /^Reorder / })
    .map((handle) =>
      handle.getAttribute('aria-label')?.replace('Reorder ', '')
    );

beforeEach(() => {
  jest.resetAllMocks();
  mockedSeries.getSeries.mockResolvedValue(series);
  mockedSeries.listSeriesBooks.mockResolvedValue({
    items: [first, second, coraDraft],
  });
  mockedAuthors.searchAuthors.mockResolvedValue([]);
});

describe('EditSeriesPage', () => {
  it('loads the series and saves its fields', async () => {
    mockedSeries.updateSeries.mockResolvedValue(series);
    renderPage();

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveValue('The Scale Cycle');

    await userEvent.clear(title);
    await userEvent.type(title, 'The Scale Saga');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockedSeries.updateSeries).toHaveBeenCalledWith(12, {
      title: 'The Scale Saga',
      description: 'Dragons, in four parts.',
      tags: ['epic'],
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('lists every book in Series order with its status, a co-author’s draft included', async () => {
    renderPage();

    await booksLoaded();
    expect(bookTitlesOnScreen()).toEqual(['Hatchling', 'Wyrm', 'Cora’s Draft']);
    expect(screen.getByRole('link', { name: 'Hatchling' })).toHaveAttribute(
      'href',
      '/books/1'
    );
    expect(screen.getByText('Draft')).toBeInTheDocument();
    // Ann may order Cora's draft but not open it: it is named, not linked.
    expect(screen.getByText('Cora’s Draft')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cora’s Draft' })).toBeNull();
  });

  it('takes a book out of the series once asked', async () => {
    mockedSeries.removeBookFromSeries.mockResolvedValue(undefined);
    renderPage();

    await booksLoaded();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Remove from series' })[1]
    );
    expect(mockedSeries.removeBookFromSeries).not.toHaveBeenCalled();

    await screen.findByText('Take this book out of the series?');
    await userEvent.click(screen.getByRole('button', { name: 'Take it out' }));

    await waitFor(() =>
      expect(mockedSeries.removeBookFromSeries).toHaveBeenCalledWith(12, 2)
    );
  });

  it('manages the co-authors and deletes the series behind a confirmation', async () => {
    mockedSeries.deleteSeries.mockResolvedValue(undefined);
    renderPage();

    expect(await screen.findByText('Cora Writer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete series' })
    );
    expect(mockedSeries.deleteSeries).not.toHaveBeenCalled();
    await screen.findByText('Delete this series?');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(mockedSeries.deleteSeries).toHaveBeenCalledWith(12)
    );
    expect(await screen.findByText('My books list')).toBeInTheDocument();
  });

  it('turns away an account that does not co-author the series', async () => {
    renderPage(account({ id: 99, login: 'reader', role: 'user' }));

    expect(
      await screen.findByText('Only its co-authors can edit this series.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(mockedSeries.listSeriesBooks).not.toHaveBeenCalled();
  });

  it('lets a moderator edit the series and open every book, but not change its byline', async () => {
    renderPage(account({ id: 99, login: 'admin', role: 'admin' }));

    expect(await screen.findByLabelText('Title')).toBeInTheDocument();
    await screen.findByText('Cora’s Draft');
    expect(
      screen.getByRole('link', { name: 'Cora’s Draft' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('reports a series that will not load', async () => {
    mockedSeries.getSeries.mockRejectedValue(new Error('nope'));
    renderPage();

    expect(
      await screen.findByText('Could not load this series.')
    ).toBeInTheDocument();
  });
});

describe('EditSeriesPage Series order', () => {
  let restoreLayout: () => void;
  beforeEach(() => {
    restoreLayout = layOutSortableRows();
  });
  afterEach(() => restoreLayout());

  it('shows the new order at once and saves it on drop', async () => {
    mockedSeries.reorderSeriesBooks.mockReturnValue(new Promise(() => {}));
    renderPage();

    await booksLoaded();
    await moveWithKeyboard(
      screen.getByRole('button', { name: 'Reorder Hatchling' }),
      'ArrowDown'
    );

    expect(mockedSeries.reorderSeriesBooks).toHaveBeenCalledWith(12, [2, 1, 3]);
    expect(bookTitlesOnScreen()).toEqual(['Wyrm', 'Hatchling', 'Cora’s Draft']);
  });

  it('puts the old order back when the save fails', async () => {
    mockedSeries.reorderSeriesBooks.mockRejectedValue(
      new ApiError(500, 'Internal Server Error')
    );
    mockedSeries.listSeriesBooks
      .mockResolvedValueOnce({ items: [first, second, coraDraft] })
      .mockReturnValue(new Promise(() => {}));
    renderPage();

    await booksLoaded();
    await moveWithKeyboard(
      screen.getByRole('button', { name: 'Reorder Hatchling' }),
      'ArrowDown'
    );

    expect(
      await screen.findByText('Could not save the new book order.')
    ).toBeInTheDocument();
    expect(bookTitlesOnScreen()).toEqual(['Hatchling', 'Wyrm', 'Cora’s Draft']);
  });

  it('on a conflict reloads the books and says why the order changed', async () => {
    mockedSeries.reorderSeriesBooks.mockRejectedValue(
      new ApiError(
        409,
        'The books of this series changed since you loaded them'
      )
    );
    mockedSeries.listSeriesBooks
      .mockResolvedValueOnce({ items: [first, second, coraDraft] })
      .mockResolvedValue({ items: [first, second] });
    renderPage();

    await booksLoaded();
    await moveWithKeyboard(
      screen.getByRole('button', { name: 'Reorder Wyrm' }),
      'ArrowUp'
    );

    expect(
      await screen.findByText(
        'A co-author changed the books of this series while you were reordering them. This is their current order.'
      )
    ).toBeInTheDocument();
    // Waits for the refetched list on the cheap query, then reads its order once.
    await waitFor(() => expect(screen.queryByText('Cora’s Draft')).toBeNull());
    expect(bookTitlesOnScreen()).toEqual(['Hatchling', 'Wyrm']);
  });
});
