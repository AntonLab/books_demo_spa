import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FC } from 'react';
import { BookReadingListsTab } from './BookReadingListsTab';
import { useBookReadingLists } from './useBookReadingLists';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ApiError } from '@/api/client';
import * as readingListsApi from '@/api/readingLists';
import type { PublicReadingList } from '@/types/readingList';

jest.mock('@/api/readingLists');
const mocked = jest.mocked(readingListsApi);

const list = (id: number, title: string, itemCount = 3): PublicReadingList => ({
  id,
  title,
  description: '',
  tags: [],
  owner: { id: 9, login: 'reader' },
  itemCount,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});
const page = (items: PublicReadingList[], total: number, current = 1) => ({
  items,
  total,
  current,
  pageSize: 10,
});

// The page calls the hook for the tab label's count, so the test does too.
const Probe: FC = () => {
  const lists = useBookReadingLists(7);
  return (
    <>
      <p>{`count ${lists.total}`}</p>
      <BookReadingListsTab list={lists} />
    </>
  );
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('BookReadingListsTab', () => {
  it('lists the lists holding the Book as cards linked to their pages, ten to a page', async () => {
    mocked.listReadingLists.mockResolvedValue(
      page([list(4, 'Cold nights')], 1)
    );
    renderWithProviders(<Probe />);

    expect(
      await screen.findByRole('link', { name: 'Cold nights' })
    ).toHaveAttribute('href', '/lists/4');
    expect(screen.getByRole('link', { name: 'reader' })).toHaveAttribute(
      'href',
      '/accounts/9'
    );
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.getByText('count 1')).toBeInTheDocument();
    expect(mocked.listReadingLists).toHaveBeenCalledWith({
      bookId: 7,
      current: 1,
      pageSize: 10,
    });
    expect(screen.queryByRole('list', { name: /pagination/i })).toBeNull();
  });

  it('says so when no list holds the Book', async () => {
    mocked.listReadingLists.mockResolvedValue(page([], 0));
    renderWithProviders(<Probe />);

    expect(
      await screen.findByText('Not in any reading list yet.')
    ).toBeInTheDocument();
    expect(screen.getByText('count 0')).toBeInTheDocument();
  });

  it('pages when more than ten lists hold the Book', async () => {
    mocked.listReadingLists.mockResolvedValue(
      page([list(4, 'Cold nights')], 11)
    );
    renderWithProviders(<Probe />);

    await userEvent.click(await screen.findByTitle('2'));

    await waitFor(() =>
      expect(mocked.listReadingLists).toHaveBeenLastCalledWith({
        bookId: 7,
        current: 2,
        pageSize: 10,
      })
    );
  });

  it('steps back to the last page when the one on screen vanishes', async () => {
    mocked.listReadingLists.mockImplementation(async ({ current }) =>
      current === 1 ? page([list(4, 'Cold nights')], 11) : page([], 10, 2)
    );
    renderWithProviders(<Probe />);

    await userEvent.click(await screen.findByTitle('2'));

    // Page 1 is cached, so stepping back shows it without a second request.
    expect(
      await screen.findByRole('link', { name: 'Cold nights' })
    ).toBeInTheDocument();
    expect(mocked.listReadingLists).toHaveBeenCalledWith({
      bookId: 7,
      current: 2,
      pageSize: 10,
    });
    expect(screen.getByTitle('1').closest('li')).toHaveClass(
      'ant-pagination-item-active'
    );
  });

  it('shows the server message when the lists cannot load', async () => {
    mocked.listReadingLists.mockRejectedValue(
      new ApiError(500, 'Server error')
    );
    renderWithProviders(<Probe />);

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });
});
