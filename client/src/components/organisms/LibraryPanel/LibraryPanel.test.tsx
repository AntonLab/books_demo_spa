import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import type { ReadingStatus } from 'shared';
import { LibraryPanel } from './LibraryPanel';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as libraryApi from '@/api/library';
import { ApiError } from '@/api/client';
import type { LibraryBook } from '@/types/library';

jest.mock('@/api/library');
const mockedLibrary = jest.mocked(libraryApi);

const book = (id: number, title: string) => ({
  id,
  title,
  status: 'complete',
  authors: [
    {
      id: 3,
      login: 'ann',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
  ],
  description: 'D.',
  tags: [],
  genre: null,
  coverUrl: null,
  seriesId: null,
  series: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});
const entry = (
  id: number,
  title: string,
  readingStatus: ReadingStatus
): LibraryBook =>
  ({ ...book(id, title), readingStatus }) as unknown as LibraryBook;
const page = (
  items: LibraryBook[],
  total = items.length,
  current = 1,
  pageSize = 20
) => ({ items, total, current, pageSize });
// A clamped title is also rendered once more, hidden, so match the link.
const titleLink = (title: string) => screen.findByRole('link', { name: title });
const Probe = () => <div data-testid="search">{useLocation().search}</div>;
const renderPanel = (route = '/profile/library') =>
  renderWithProviders(
    <>
      <LibraryPanel />
      <Probe />
    </>,
    { route }
  );

describe('LibraryPanel', () => {
  beforeEach(() => jest.resetAllMocks());

  it('lists the books with their statuses, asking for every status but Not interested', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'reading'), entry(2, 'Tides', 'read')])
    );
    renderPanel();
    expect(await titleLink('Dragons')).toBeInTheDocument();
    expect(await titleLink('Tides')).toBeInTheDocument();
    expect(mockedLibrary.listLibrary).toHaveBeenCalledWith({
      status: undefined,
      current: 1,
      pageSize: 20,
    });
    expect(
      screen.getAllByRole('combobox', { name: 'Reading status' })
    ).toHaveLength(2);
  });

  it('filters by a status and resets to page 1', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'reading')], 45, 2)
    );
    renderPanel('/profile/library?page=2');
    await titleLink('Dragons');
    await userEvent.click(
      screen.getByRole('combobox', { name: 'Filter by reading status' })
    );
    await userEvent.click(screen.getByTitle('Not interested'));
    expect(screen.getByTestId('search')).toHaveTextContent(
      '?status=not_interested'
    );
    await waitFor(() =>
      expect(mockedLibrary.listLibrary).toHaveBeenLastCalledWith({
        status: 'not_interested',
        current: 1,
        pageSize: 20,
      })
    );
  });

  it('reads a bad status or page as the default', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'read')])
    );
    renderPanel('/profile/library?status=nonsense&page=abc');
    await titleLink('Dragons');
    expect(mockedLibrary.listLibrary).toHaveBeenCalledWith({
      status: undefined,
      current: 1,
      pageSize: 20,
    });
  });

  it('steps back when the page is past the end', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(page([], 25, 3));
    renderPanel('/profile/library?page=3');
    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent('?page=2')
    );
  });

  it('changes a row’s status, and removes a row from the Library', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'reading'), entry(2, 'Tides', 'read')])
    );
    mockedLibrary.setReadingStatus.mockResolvedValue({
      bookId: 2,
      status: 'reading',
      updatedAt: '2026-10-02T10:00:00.000Z',
    });
    mockedLibrary.clearReadingStatus.mockResolvedValue(undefined);
    renderPanel();
    await titleLink('Dragons');
    const [first, second] = screen.getAllByRole('combobox', {
      name: 'Reading status',
    }) as [HTMLElement, HTMLElement];
    await userEvent.click(second);
    await userEvent.click(screen.getByRole('option', { name: 'Reading' }));
    expect(mockedLibrary.setReadingStatus).toHaveBeenCalledWith(2, 'reading');
    await userEvent.click(first);
    // The first row's list is the one whose option ids carry that row's id.
    const removeOptions = screen.getAllByRole('option', {
      name: 'Remove from library',
    });
    await userEvent.click(
      removeOptions.find((option) =>
        option.id.startsWith('reading-status-1_')
      ) as HTMLElement
    );
    expect(mockedLibrary.clearReadingStatus).toHaveBeenCalledWith(1);
  });

  it('refetches the list after a change', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'reading')])
    );
    mockedLibrary.clearReadingStatus.mockResolvedValue(undefined);
    renderPanel();
    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Reading status' })
    );
    await userEvent.click(screen.getByTitle('Remove from library'));
    await waitFor(() =>
      expect(mockedLibrary.listLibrary).toHaveBeenCalledTimes(2)
    );
  });

  it('toasts a failed row change', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(
      page([entry(1, 'Dragons', 'reading')])
    );
    mockedLibrary.setReadingStatus.mockRejectedValue(
      new ApiError(404, 'Book 1 not found')
    );
    renderPanel();
    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Reading status' })
    );
    await userEvent.click(screen.getByTitle('Read'));
    expect(await screen.findByText('Book 1 not found')).toBeInTheDocument();
  });

  it('says so when the Library is empty, and differently under a filter', async () => {
    mockedLibrary.listLibrary.mockResolvedValue(page([]));
    renderPanel();
    expect(
      await screen.findByText('Your Library is empty.')
    ).toBeInTheDocument();
    renderPanel('/profile/library?status=read');
    expect(
      await screen.findByText('No books with this status.')
    ).toBeInTheDocument();
  });

  it('shows an error when the list fails to load', async () => {
    mockedLibrary.listLibrary.mockRejectedValue(new ApiError(500, 'boom'));
    renderPanel();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
