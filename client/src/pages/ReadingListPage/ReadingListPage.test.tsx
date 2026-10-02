import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useNavigationType } from 'react-router';
import { ReadingListPage } from './ReadingListPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as readingListsApi from '@/api/readingLists';
import { ApiError } from '@/api/client';
import type { PublicBook } from '@/types/book';
import type { PublicUser, PublicSeries } from '@/types/api';
import type { ReadingListDetail } from '@/types/readingList';

jest.mock('@/api/readingLists');
jest.mock('@/api/authors');
jest.mock('@/api/books');
jest.mock('@/api/genres');
jest.mock('@/api/series');
jest.mock('@/api/favorites');

const mocked = jest.mocked(readingListsApi);

const coAuthor = {
  id: 3,
  login: 'Author',
  firstName: 'Ann',
  lastName: 'Author',
  avatarUrl: null,
};

const book: PublicBook = {
  id: 1,
  authors: [coAuthor],
  seriesId: null,
  series: null,
  title: 'A Tale of Dragons',
  description: 'A tale of dragons',
  tags: [],
  status: 'in_progress',
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const series: PublicSeries = {
  id: 12,
  coverUrl: null,
  bookCount: 2,
  authors: [coAuthor],
  title: 'The Ashgrove Chronicles',
  description: 'Letters found in a manor.',
  tags: [],
  genre: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const detail: ReadingListDetail = {
  id: 4,
  title: 'Cold nights',
  description: 'Long reads.',
  tags: ['winter'],
  owner: { id: 9, login: 'reader' },
  itemCount: 2,
  items: [
    { id: 1, kind: 'book', book },
    { id: 2, kind: 'series', series },
  ],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const account = (id: number, login: string): PublicUser =>
  ({
    id,
    login,
    firstName: 'Rita',
    lastName: 'Reader',
    avatarUrl: null,
    email: `${login}@example.com`,
    role: 'user',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }) as PublicUser;

const owner = account(9, 'reader');
const other = account(10, 'other');

const HomeProbe = () => <p>{`Home|${useNavigationType()}`}</p>;

const renderPage = (route: string, session: PublicUser | null) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(
    <Routes>
      <Route path="/lists/:id" element={<ReadingListPage />} />
      <Route path="/" element={<HomeProbe />} />
      <Route path="/profile/lists" element={<p>Profile lists</p>} />
    </Routes>,
    { route, queryClient }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('ReadingListPage', () => {
  it('shows a Guest the list and its items in order, with no write control', async () => {
    mocked.getReadingList.mockResolvedValue(detail);
    renderPage('/lists/4', null);
    expect(
      await screen.findByRole('heading', { name: 'Cold nights' })
    ).toBeInTheDocument();
    const links = screen.getAllByRole('link').map((link) => link.textContent);
    expect(links.indexOf('A Tale of Dragons')).toBeLessThan(
      links.indexOf('The Ashgrove Chronicles')
    );
    for (const name of ['Edit', 'Delete', 'Add to mine']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('shows the owner Edit and Delete and no Add to mine', async () => {
    mocked.getReadingList.mockResolvedValue(detail);
    renderPage('/lists/4', owner);
    expect(
      await screen.findByRole('button', { name: 'Edit' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to mine' })).toBeNull();
  });

  it('lets another Account, an admin included, copy the list and opens the copy', async () => {
    const copy = { ...detail, id: 8, owner: { id: 10, login: 'other' } };
    mocked.getReadingList.mockImplementation((id) =>
      Promise.resolve(id === 8 ? copy : detail)
    );
    mocked.copyReadingList.mockResolvedValue(copy);
    renderPage('/lists/4', other);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add to mine' })
    );
    await waitFor(() => expect(mocked.copyReadingList).toHaveBeenCalledWith(4));
    await waitFor(() => expect(mocked.getReadingList).toHaveBeenCalledWith(8));
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeNull();
  });

  it('keeps the page and says why when the copy fails', async () => {
    mocked.getReadingList.mockResolvedValue(detail);
    mocked.copyReadingList.mockRejectedValue(
      new ApiError(404, 'ReadingList 4 not found')
    );
    renderPage('/lists/4', other);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add to mine' })
    );
    expect(
      await screen.findByText('ReadingList 4 not found')
    ).toBeInTheDocument();
  });

  it('deletes only once confirmed and goes to the Profile tab', async () => {
    mocked.getReadingList.mockResolvedValue(detail);
    mocked.deleteReadingList.mockResolvedValue(undefined);
    renderPage('/lists/4', owner);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );
    expect(mocked.deleteReadingList).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete reading list' })
    );
    await waitFor(() =>
      expect(mocked.deleteReadingList).toHaveBeenCalledWith(4)
    );
    expect(await screen.findByText('Profile lists')).toBeInTheDocument();
  });

  it('opens the Edit modal for the owner', async () => {
    mocked.getReadingList.mockResolvedValue(detail);
    mocked.listReadingListItems.mockResolvedValue({ items: [] });
    renderPage('/lists/4', owner);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(await screen.findByText('Edit reading list')).toBeInTheDocument();
  });

  it.each(['/lists/4', '/lists/abc'])(
    'sends %s to Home with "This reading list no longer exists." when there is no such list',
    async (route) => {
      mocked.getReadingList.mockRejectedValue(
        new ApiError(404, 'ReadingList 4 not found')
      );
      renderPage(route, null);
      expect(await screen.findByText(/^Home\|/)).toBeInTheDocument();
      expect(
        await screen.findByText('This reading list no longer exists.')
      ).toBeInTheDocument();
    }
  );

  it('shows the empty text when every item is hidden', async () => {
    mocked.getReadingList.mockResolvedValueOnce({
      ...detail,
      items: [],
      itemCount: 0,
    });
    renderPage('/lists/4', null);
    expect(
      await screen.findByText('No items in this reading list yet.')
    ).toBeInTheDocument();
  });

  it('shows an error, not a redirect, when the load fails with a server error', async () => {
    mocked.getReadingList.mockRejectedValue(new ApiError(500, 'Server error'));
    renderPage('/lists/4', null);
    expect(
      await screen.findByText('Could not load this reading list.')
    ).toBeInTheDocument();
  });
});
