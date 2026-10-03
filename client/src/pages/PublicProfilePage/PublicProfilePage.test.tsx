import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link } from 'react-router';
import { PublicProfilePage } from './PublicProfilePage';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as accountsApi from '@/api/accounts';
import * as authApi from '@/api/auth';
import * as booksApi from '@/api/books';
import { ApiError } from '@/api/client';
import * as seriesApi from '@/api/series';
import type { AccountProfile, PublicUser } from '@/types/api';

jest.mock('@/api/accounts');
jest.mock('@/api/auth');
jest.mock('@/api/books');
jest.mock('@/api/series');

const mockedAccounts = jest.mocked(accountsApi);
const mockedAuth = jest.mocked(authApi);
const mockedBooks = jest.mocked(booksApi);
const mockedSeries = jest.mocked(seriesApi);

const profile: AccountProfile = {
  id: 7,
  firstName: 'Margaret',
  lastName: 'Hale',
  avatarUrl: null,
  about: '',
  lastSeenAt: null,
  bookCount: 0,
  seriesCount: 0,
  totals: {
    booksInReadingLists: 1,
    seriesInReadingLists: 2,
    bookLikes: 3,
    seriesLikes: 4,
    commentsOnBooks: 5,
    favorites: 6,
  },
};

const renderPage = (route = '/accounts/7') =>
  renderWithProviders(<PublicProfilePage />, {
    route,
    path: '/accounts/:id',
  });

beforeEach(() => {
  jest.resetAllMocks();
  mockedAuth.me.mockRejectedValue(new ApiError(401, 'Authentication required'));
  mockedAccounts.getAccountProfile.mockResolvedValue(profile);
});

describe('PublicProfilePage', () => {
  it('shows the name, the Profile tab and the totals', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Margaret Hale' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Favorites').parentElement).toHaveTextContent(
      /Favorites\s*6$/
    );
  });

  it('shows Online now for a fresh last seen time', async () => {
    mockedAccounts.getAccountProfile.mockResolvedValue({
      ...profile,
      lastSeenAt: new Date().toISOString(),
    });
    renderPage();

    expect(await screen.findByText('Online now')).toBeInTheDocument();
  });

  it('shows no online text when the last seen time is hidden', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Margaret Hale' });
    expect(screen.queryByText(/online/i)).toBeNull();
  });

  it('shows About only when the Account wrote one', async () => {
    mockedAccounts.getAccountProfile.mockResolvedValueOnce(profile);
    const empty = renderPage();
    await screen.findByRole('heading', { name: 'Margaret Hale' });
    expect(screen.queryByText('About')).toBeNull();
    empty.unmount();

    mockedAccounts.getAccountProfile.mockResolvedValueOnce({
      ...profile,
      about: 'Hi',
    });
    renderPage();
    expect(await screen.findByText('Hi')).toBeInTheDocument();
  });

  it('shows the viewer their own page without navigating away', async () => {
    const me: PublicUser = {
      id: 7,
      login: 'margaret',
      email: 'm@example.com',
      firstName: 'Margaret',
      lastName: 'Hale',
      status: 'active',
      role: 'user',
      avatarUrl: null,
      about: '',
      showLastSeen: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    mockedAuth.me.mockResolvedValue(me);
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Margaret Hale' })
    ).toBeInTheDocument();
  });

  it('shows a status while the profile loads', () => {
    mockedAccounts.getAccountProfile.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error when the server fails', async () => {
    mockedAccounts.getAccountProfile.mockRejectedValue(new ApiError(500, 'x'));
    renderPage();

    expect(
      await screen.findByText('Could not load this profile.')
    ).toBeInTheDocument();
  });

  describe('list tabs', () => {
    const counted = { ...profile, bookCount: 45, seriesCount: 3 };
    const tabNames = () =>
      screen.getAllByRole('tab').map((tab) => tab.textContent);

    beforeEach(() => {
      mockedAccounts.getAccountProfile.mockResolvedValue(counted);
      mockedBooks.listBooks.mockResolvedValue({
        items: [],
        total: 0,
        current: 1,
        pageSize: 20,
      });
      mockedSeries.listSeries.mockResolvedValue({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
      });
    });

    it('reads Profile, Series, Books with their counts', async () => {
      renderPage();
      await screen.findByRole('heading', { name: 'Margaret Hale' });

      expect(tabNames()).toEqual(['Profile', 'Series (3)', 'Books (45)']);
    });

    it('hides a tab whose count is 0', async () => {
      mockedAccounts.getAccountProfile.mockResolvedValue({
        ...counted,
        seriesCount: 0,
      });
      const noSeries = renderPage();
      await screen.findByRole('heading', { name: 'Margaret Hale' });
      expect(tabNames()).toEqual(['Profile', 'Books (45)']);
      noSeries.unmount();

      mockedAccounts.getAccountProfile.mockResolvedValue({
        ...counted,
        bookCount: 0,
      });
      const noBooks = renderPage();
      await screen.findByRole('heading', { name: 'Margaret Hale' });
      expect(tabNames()).toEqual(['Profile', 'Series (3)']);
      noBooks.unmount();

      mockedAccounts.getAccountProfile.mockResolvedValue(profile);
      renderPage();
      await screen.findByRole('heading', { name: 'Margaret Hale' });
      expect(tabNames()).toEqual(['Profile']);
    });

    it('asks no list while Profile shows', async () => {
      renderPage();
      await screen.findByRole('heading', { name: 'Margaret Hale' });

      expect(mockedBooks.listBooks).not.toHaveBeenCalled();
      expect(mockedSeries.listSeries).not.toHaveBeenCalled();
    });

    it('starts a list from its defaults after a tab switch', async () => {
      const user = userEvent.setup();
      renderPage('/accounts/7?page=3&sort=new');
      await screen.findByRole('heading', { name: 'Margaret Hale' });

      await user.click(screen.getByRole('tab', { name: 'Books (45)' }));
      await waitFor(() =>
        expect(mockedBooks.listBooks).toHaveBeenCalledWith({
          userId: 7,
          published: 'true',
          sort: 'popular',
          current: 1,
          pageSize: 20,
        })
      );

      await user.click(await screen.findByText('New releases'));
      await waitFor(() =>
        expect(mockedBooks.listBooks).toHaveBeenLastCalledWith(
          expect.objectContaining({ sort: 'new' })
        )
      );
      await user.click(screen.getByRole('tab', { name: 'Profile' }));
      await user.click(screen.getByRole('tab', { name: 'Books (45)' }));

      // The popular page 1 is cached, so the reset shows as the checked sort,
      // not as a new request.
      expect(
        await screen.findByRole('radio', { name: 'Popular' })
      ).toBeChecked();
    });
  });

  it('loads the next Account when the id changes', async () => {
    mockedAccounts.getAccountProfile.mockImplementation((id) =>
      Promise.resolve(
        id === 8 ? { ...profile, id: 8, firstName: 'Nicholas' } : profile
      )
    );
    renderWithProviders(
      <>
        <Link to="/accounts/8">next</Link>
        <PublicProfilePage />
      </>,
      { route: '/accounts/7', path: '/accounts/:id' }
    );
    await screen.findByRole('heading', { name: 'Margaret Hale' });

    await userEvent.click(screen.getByRole('link', { name: 'next' }));

    expect(
      await screen.findByRole('heading', { name: 'Nicholas Hale' })
    ).toBeInTheDocument();
    expect(mockedAccounts.getAccountProfile).toHaveBeenCalledWith(8);
  });
});
