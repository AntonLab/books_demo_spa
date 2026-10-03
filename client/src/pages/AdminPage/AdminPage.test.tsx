import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { AdminPage } from './AdminPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { adminGenre } from '@/test/genres';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as genresApi from '@/api/genres';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/auth');
jest.mock('@/api/genres');
jest.mock('@/api/reports');

const mockedGenres = jest.mocked(genresApi);

const admin: PublicUser = {
  id: 1,
  login: 'root',
  email: 'root@example.com',
  firstName: 'Root',
  lastName: 'Admin',
  status: 'active',
  role: 'admin',
  avatarUrl: null,
  about: '',
  showLastSeen: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const LocationProbe = () => (
  <div data-testid="location">{useLocation().pathname}</div>
);

const expectSentHome = () =>
  waitFor(() =>
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  );

// Seeds the session cache so the page renders a settled state without waiting
// on a request.
const renderPage = (session: PublicUser | null, route: string) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(
    <>
      <AdminPage />
      <LocationProbe />
    </>,
    { queryClient, route }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenreCounts.mockResolvedValue({
    items: [adminGenre(5, 'Mystery')],
  });
});

describe('AdminPage', () => {
  it.each(['/admin/reports', '/admin/genres'])(
    'sends an anonymous visitor at %s home and loads nothing',
    async (route) => {
      renderPage(null, route);

      await expectSentHome();
      expect(screen.queryByRole('heading', { name: 'Admin panel' })).toBeNull();
      expect(mockedGenres.listGenreCounts).not.toHaveBeenCalled();
    }
  );

  it('sends an author home with the default denial popup', async () => {
    renderPage({ ...admin, role: 'author' }, '/admin/reports');

    await expectSentHome();
    expect(
      await screen.findAllByText("You don't have access to this page.")
    ).toHaveLength(1);
    expect(mockedGenres.listGenreCounts).not.toHaveBeenCalled();
  });

  it.each(['admin', 'superadmin'] as const)(
    'serves a %s the panel with Reports selected by default',
    async (role) => {
      renderPage({ ...admin, role }, '/admin/reports');

      expect(
        await screen.findByRole('heading', { name: 'Admin panel' })
      ).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Reports' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(mockedGenres.listGenreCounts).not.toHaveBeenCalled();
    }
  );

  it('selects Genres at /admin/genres and shows the genre list', async () => {
    renderPage(admin, '/admin/genres');

    expect(await screen.findByText('Mystery')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Genres' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('navigates when a tab is clicked, and drops the hidden tab', async () => {
    renderPage(admin, '/admin/reports');

    await userEvent.click(await screen.findByRole('tab', { name: 'Genres' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/genres');
    expect(await screen.findByText('Mystery')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Reports' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/reports');
    await waitFor(() => expect(screen.queryByText('Mystery')).toBeNull());
  });
});
