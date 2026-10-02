import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { ProfilePage } from './ProfilePage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as authApi from '@/api/auth';
import { ApiError } from '@/api/client';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import * as libraryApi from '@/api/library';
import * as notificationsApi from '@/api/notifications';
import * as seriesApi from '@/api/series';
import * as usersApi from '@/api/users';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/users');
jest.mock('@/api/auth');
jest.mock('@/api/books');
jest.mock('@/api/genres');
jest.mock('@/api/notifications');
jest.mock('@/api/series');
jest.mock('@/api/library');
const mockedLibrary = jest.mocked(libraryApi);
const mockedAuth = jest.mocked(authApi);
const mockedBooks = jest.mocked(booksApi);
const mockedGenres = jest.mocked(genresApi);
const mockedNotifications = jest.mocked(notificationsApi);
const mockedSeries = jest.mocked(seriesApi);
const mockedUsers = jest.mocked(usersApi);

const session: PublicUser = {
  id: 1,
  login: 'bob',
  email: 'bob@example.com',
  firstName: 'Bob',
  lastName: 'Bobson',
  status: 'active',
  role: 'user',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const author: PublicUser = { ...session, role: 'author' };

const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
};

// Seeds the session cache directly, so a test settles without waiting on
// GET /me, and renders a probe beside the page so a test can see where a tab
// click or a redirect landed.
const renderWithSession = (data: PublicUser | null, route = '/profile') => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, data);
  return renderWithProviders(
    <>
      <ProfilePage />
      <LocationProbe />
    </>,
    { queryClient, route }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedAuth.me.mockResolvedValue(session);
  mockedNotifications.getNotificationSettings.mockResolvedValue({
    emailNotifications: true,
  });
  const bookPage = { items: [], total: 0, current: 1, pageSize: 20 };
  const seriesPage = { items: [], total: 0, limit: 20, offset: 0 };
  mockedBooks.listFavoritedBooks.mockResolvedValue(bookPage);
  mockedBooks.listBooks.mockResolvedValue(bookPage);
  mockedSeries.listSeries.mockResolvedValue(seriesPage);
  mockedSeries.listFavoritedSeries.mockResolvedValue(seriesPage);
  mockedGenres.listGenres.mockResolvedValue({ items: [] });
});

describe('ProfilePage while the session is loading', () => {
  it('shows only a spinner and redirects nowhere', () => {
    // Never resolves, so the session query stays pending for the assertion.
    mockedAuth.me.mockReturnValue(new Promise<PublicUser>(() => {}));

    renderWithProviders(
      <>
        <ProfilePage />
        <LocationProbe />
      </>,
      { route: '/profile' }
    );

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/profile$/);
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('ProfilePage when the session fails to load', () => {
  it('shows an error instead of the profile', async () => {
    // Not a 401: that one is the ordinary "nobody is signed in" case, which
    // the query itself turns into a `null` success (see queries/auth.ts).
    mockedAuth.me.mockRejectedValue(new ApiError(500, 'Server error'));

    renderWithProviders(<ProfilePage />);

    expect(
      await screen.findByText('Could not load your profile.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('ProfilePage, signed out', () => {
  it('sends the visitor home and shows no tabs', async () => {
    renderWithSession(null);

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    );
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('offers no email switch to a Guest and asks for no settings', () => {
    renderWithSession(null);

    expect(screen.queryByRole('switch')).toBeNull();
    expect(mockedNotifications.getNotificationSettings).not.toHaveBeenCalled();
  });
});

describe('ProfilePage after a password change', () => {
  it('sends the user home, which ends the session', async () => {
    mockedUsers.updateUser.mockResolvedValue(session);
    const user = userEvent.setup();
    renderWithSession(session);

    await user.type(screen.getByLabelText('Current password'), 'old-secret1');
    await user.type(screen.getByLabelText('New password'), 'new-secret1');
    await user.type(screen.getByLabelText('Confirm password'), 'new-secret1');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    );
    expect(
      screen.getByText('Password changed. Sign in with your new password.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('ProfilePage tabs', () => {
  it('opens the Account tab at /profile', async () => {
    renderWithSession(session, '/profile');

    expect(
      await screen.findByRole('switch', { name: 'Email notifications' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('keeps /profile#email-notifications on the Account tab', async () => {
    // Announcement emails link here; the tab is found by pathname alone.
    renderWithSession(session, '/profile#email-notifications');

    expect(
      await screen.findByRole('switch', { name: 'Email notifications' })
    ).toBeInTheDocument();
  });

  it('opens the Favorites tab at /profile/favorites', async () => {
    renderWithSession(session, '/profile/favorites');

    expect(
      await screen.findByText('No book is in your favorites yet.')
    ).toBeInTheDocument();
  });

  it('opens the Library tab at /profile/library', async () => {
    mockedLibrary.listLibrary.mockResolvedValue({
      items: [],
      total: 0,
      current: 1,
      pageSize: 20,
    });
    renderWithSession(session, '/profile/library');

    expect(
      await screen.findByText('Your Library is empty.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Library', selected: true })
    ).toBeInTheDocument();
  });

  it('lists the Library tab after Favorites for a plain reader', async () => {
    renderWithSession(session, '/profile');

    await screen.findByRole('switch', { name: 'Email notifications' });
    const names = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(names).toEqual(['Account', 'Favorites', 'Library']);
  });

  it('does not fetch the Library while another tab is open', async () => {
    renderWithSession(session, '/profile');

    await screen.findByRole('switch', { name: 'Email notifications' });
    expect(mockedLibrary.listLibrary).not.toHaveBeenCalled();
  });

  it('navigates to /profile/library when the Library tab is clicked', async () => {
    mockedLibrary.listLibrary.mockResolvedValue({
      items: [],
      total: 0,
      current: 1,
      pageSize: 20,
    });
    renderWithSession(session, '/profile');
    await screen.findByRole('switch', { name: 'Email notifications' });

    await userEvent.click(screen.getByRole('tab', { name: 'Library' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      /^\/profile\/library$/
    );
  });

  it('sends a Guest at /profile/library home and asks for no Library', async () => {
    renderWithSession(null, '/profile/library');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    );
    expect(mockedLibrary.listLibrary).not.toHaveBeenCalled();
  });

  it('opens the My works tab at /profile/my-books for an author', async () => {
    renderWithSession(author, '/profile/my-books');

    expect(
      await screen.findByRole('button', { name: 'Create book' })
    ).toBeInTheDocument();
  });

  it('does not fetch Favorites while the Account tab is open', async () => {
    renderWithSession(session, '/profile');

    await screen.findByRole('switch', { name: 'Email notifications' });
    expect(mockedBooks.listFavoritedBooks).not.toHaveBeenCalled();
    expect(mockedSeries.listFavoritedSeries).not.toHaveBeenCalled();
  });

  it('leaves My works with no filters when the Favorites tab is clicked', async () => {
    renderWithSession(author, '/profile/my-books?tab=series&q=x&page=2');
    await screen.findByRole('button', { name: 'Create series' });

    await userEvent.click(screen.getByRole('tab', { name: 'Favorites' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      /^\/profile\/favorites$/
    );
    await waitFor(() =>
      expect(mockedBooks.listFavoritedBooks).toHaveBeenCalledTimes(1)
    );
    expect(mockedBooks.listFavoritedBooks).toHaveBeenCalledWith(
      expect.not.objectContaining({ q: 'x' })
    );
  });

  it('unmounts the Favorites panel when another tab is opened', async () => {
    renderWithSession(session, '/profile/favorites');
    await screen.findByText('No book is in your favorites yet.');

    await userEvent.click(screen.getByRole('tab', { name: 'Account' }));

    await screen.findByRole('switch', { name: 'Email notifications' });
    expect(screen.queryByText('No book is in your favorites yet.')).toBeNull();
  });

  it('lists the author’s own works with the viewer as userId', async () => {
    renderWithSession(author, '/profile/my-books');

    await waitFor(() =>
      expect(mockedBooks.listBooks).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1 })
      )
    );
  });

  it('navigates to a tab’s path when it is clicked', async () => {
    renderWithSession(session, '/profile');

    await userEvent.click(screen.getByRole('tab', { name: 'Favorites' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/profile/favorites'
    );
  });

  it('shows My works to an author', () => {
    renderWithSession(author);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Account',
      'Favorites',
      'Library',
      'My works',
    ]);
  });

  it('hides My works from every other role', () => {
    renderWithSession(session);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Account',
      'Favorites',
      'Library',
    ]);
  });

  it('sends a non-author at /profile/my-books home with one access popup, asking for no books', async () => {
    renderWithSession(session, '/profile/my-books');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    );
    expect(
      await screen.findAllByText("You don't have access to this page.")
    ).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Create book' })).toBeNull();
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });
});
