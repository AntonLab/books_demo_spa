import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation, useParams } from 'react-router';
import { ProfileReadingListsPanel } from './ProfileReadingListsPanel';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ApiError } from '@/api/client';
import * as readingListsApi from '@/api/readingLists';
import type { PublicReadingList } from '@/types/readingList';

jest.mock('@/api/readingLists');

const mocked = jest.mocked(readingListsApi);

const list = (
  id: number,
  title: string,
  itemCount: number
): PublicReadingList => ({
  id,
  title,
  description: '',
  tags: [],
  owner: { id: 9, login: 'reader' },
  itemCount,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});
const emptyPage = { items: [], total: 0, current: 1, pageSize: 20 };

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
};
const ListPage = () => <div>{`List page ${useParams().id}`}</div>;
const renderPanel = (route: string) =>
  renderWithProviders(
    <>
      <Routes>
        <Route
          path="/profile/lists"
          element={<ProfileReadingListsPanel viewerId={9} />}
        />
        <Route path="/lists/:id" element={<ListPage />} />
      </Routes>
      <LocationProbe />
    </>,
    { route }
  );

beforeEach(() => {
  jest.resetAllMocks();
});

describe('ProfileReadingListsPanel', () => {
  it("lists the caller's lists as cards linked to their pages, asking for the caller's own id", async () => {
    mocked.listReadingLists.mockResolvedValue({
      items: [list(4, 'Cold nights', 3)],
      total: 1,
      current: 1,
      pageSize: 20,
    });
    renderPanel('/profile/lists');
    expect(
      await screen.findByRole('link', { name: 'Cold nights' })
    ).toHaveAttribute('href', '/lists/4');
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(mocked.listReadingLists).toHaveBeenCalledWith({
      userId: 9,
      current: 1,
      pageSize: 20,
    });
  });

  it('says so when the caller has no list', async () => {
    mocked.listReadingLists.mockResolvedValue(emptyPage);
    renderPanel('/profile/lists');
    expect(
      await screen.findByText('You have no reading lists yet.')
    ).toBeInTheDocument();
  });

  it('asks for the page in the URL, and treats a garbage page as the first', async () => {
    mocked.listReadingLists.mockResolvedValue(emptyPage);
    renderPanel('/profile/lists?page=abc');
    await waitFor(() =>
      expect(mocked.listReadingLists).toHaveBeenCalledWith({
        userId: 9,
        current: 1,
        pageSize: 20,
      })
    );
  });

  it('moves to the last page when the typed page is past the end', async () => {
    mocked.listReadingLists.mockResolvedValue({
      items: [],
      total: 25,
      current: 9,
      pageSize: 20,
    });
    renderPanel('/profile/lists?page=9');
    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent('?page=2')
    );
  });

  it('pages with the pagination control', async () => {
    mocked.listReadingLists.mockResolvedValue({
      items: [list(4, 'Cold nights', 1)],
      total: 45,
      current: 1,
      pageSize: 20,
    });
    renderPanel('/profile/lists');
    await userEvent.click(await screen.findByTitle('2'));
    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent('?page=2')
    );
  });

  it('creates a list and opens it', async () => {
    mocked.listReadingLists.mockResolvedValue(emptyPage);
    mocked.createReadingList.mockResolvedValue(list(8, 'Warm days', 0));
    mocked.getReadingList.mockResolvedValue({
      ...list(8, 'Warm days', 0),
      items: [],
    });
    renderPanel('/profile/lists');
    await userEvent.click(
      await screen.findByRole('button', { name: 'New reading list' })
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Warm days');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create reading list' })
    );
    expect(await screen.findByText('List page 8')).toBeInTheDocument();
  });

  it('shows the server message when the list cannot load', async () => {
    mocked.listReadingLists.mockRejectedValue(
      new ApiError(500, 'Server error')
    );
    renderPanel('/profile/lists');
    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });
});
