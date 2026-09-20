import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminGenresPage } from './AdminGenresPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as genresApi from '@/api/genres';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/auth');
jest.mock('@/api/genres');

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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Seeds the session cache so the page renders a settled state without waiting
// on a request.
const renderPage = (session: PublicUser | null) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(<AdminGenresPage />, {
    queryClient,
    route: '/admin/genres',
  });
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenres.mockResolvedValue({
    items: [
      { id: 1, name: 'Gothic' },
      { id: 2, name: 'Hard SF' },
    ],
  });
});

describe('AdminGenresPage for everyone else', () => {
  it('explains itself to an anonymous visitor and asks for no genres', () => {
    renderPage(null);

    expect(screen.getByRole('heading', { name: 'Genres' })).toBeInTheDocument();
    expect(screen.getByText('Genres are kept by admins.')).toBeInTheDocument();
    expect(mockedGenres.listGenres).not.toHaveBeenCalled();
  });

  it('explains itself to an author, who keeps books rather than genres', () => {
    renderPage({ ...admin, role: 'author' });

    expect(screen.getByText('Genres are kept by admins.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Genre name')).toBeNull();
    expect(mockedGenres.listGenres).not.toHaveBeenCalled();
  });
});

describe('AdminGenresPage for a moderator', () => {
  it('lists every genre in the order the server sent', async () => {
    renderPage(admin);

    expect(await screen.findByText('Gothic')).toBeInTheDocument();
    expect(screen.getByText('Hard SF')).toBeInTheDocument();
  });

  it('serves a superadmin the same page', async () => {
    renderPage({ ...admin, role: 'superadmin' });

    expect(await screen.findByText('Gothic')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add genre' })
    ).toBeInTheDocument();
  });

  it('adds a genre by name', async () => {
    mockedGenres.createGenre.mockResolvedValue({ id: 5, name: 'Romance' });
    renderPage(admin);

    await userEvent.type(await screen.findByLabelText('Genre name'), 'Romance');
    await userEvent.click(screen.getByRole('button', { name: 'Add genre' }));

    await waitFor(() =>
      expect(mockedGenres.createGenre).toHaveBeenCalledWith({
        name: 'Romance',
      })
    );
  });

  it('refuses to add a blank name without asking the server', async () => {
    renderPage(admin);

    await screen.findByLabelText('Genre name');
    await userEvent.click(screen.getByRole('button', { name: 'Add genre' }));

    expect(await screen.findByText('Enter a name')).toBeInTheDocument();
    expect(mockedGenres.createGenre).not.toHaveBeenCalled();
  });

  it('caps the name at the length the server accepts', async () => {
    renderPage(admin);

    expect(await screen.findByLabelText('Genre name')).toHaveAttribute(
      'maxlength',
      '50'
    );
  });

  it('shows a 409 beside the field that caused it', async () => {
    mockedGenres.createGenre.mockRejectedValue(
      new ApiError(409, 'A genre with that name already exists')
    );
    renderPage(admin);

    await userEvent.type(await screen.findByLabelText('Genre name'), 'gothic');
    await userEvent.click(screen.getByRole('button', { name: 'Add genre' }));

    expect(
      await screen.findByText('A genre with that name already exists.')
    ).toBeInTheDocument();
  });

  it('renames a genre in place', async () => {
    mockedGenres.renameGenre.mockResolvedValue({
      id: 1,
      name: 'Gothic Revival',
    });
    renderPage(admin);

    await screen.findByText('Gothic');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Rename' })[0]!
    );

    const input = screen.getByLabelText('New name for Gothic');
    await userEvent.clear(input);
    await userEvent.type(input, 'Gothic Revival');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedGenres.renameGenre).toHaveBeenCalledWith(1, {
        name: 'Gothic Revival',
      })
    );
  });

  it('cancels a rename without saving it', async () => {
    renderPage(admin);

    await screen.findByText('Gothic');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Rename' })[0]!
    );
    const input = screen.getByLabelText('New name for Gothic');
    await userEvent.clear(input);
    await userEvent.type(input, 'Something else');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Gothic')).toBeInTheDocument();
    expect(screen.queryByLabelText('New name for Gothic')).toBeNull();
    expect(mockedGenres.renameGenre).not.toHaveBeenCalled();
  });

  it('shows a rename 409 beside the field that caused it', async () => {
    mockedGenres.renameGenre.mockRejectedValue(
      new ApiError(409, 'A genre with that name already exists')
    );
    renderPage(admin);

    await screen.findByText('Gothic');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Rename' })[0]!
    );
    const input = screen.getByLabelText('New name for Gothic');
    await userEvent.clear(input);
    await userEvent.type(input, 'Hard SF');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('A genre with that name already exists.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('New name for Gothic')).toHaveValue('Hard SF');
  });

  it('clears a stale rename error on cancel and on reopening the editor', async () => {
    mockedGenres.renameGenre.mockRejectedValue(
      new ApiError(409, 'A genre with that name already exists')
    );
    renderPage(admin);

    await screen.findByText('Gothic');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Rename' })[0]!
    );
    const input = screen.getByLabelText('New name for Gothic');
    await userEvent.clear(input);
    await userEvent.type(input, 'Hard SF');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('A genre with that name already exists.');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByText('A genre with that name already exists.')
    ).toBeNull();

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Rename' })[0]!
    );

    expect(
      screen.queryByText('A genre with that name already exists.')
    ).toBeNull();
  });

  it('deletes behind a confirmation that warns about the works', async () => {
    mockedGenres.deleteGenre.mockResolvedValue(undefined);
    renderPage(admin);

    await screen.findByText('Gothic');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Delete' })[0]!
    );

    expect(
      await screen.findByText(
        'Books and series in this genre will be left without one.'
      )
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

    await waitFor(() =>
      expect(mockedGenres.deleteGenre).toHaveBeenCalledWith(1)
    );
  });

  it('reports a failure to delete', async () => {
    mockedGenres.deleteGenre.mockRejectedValue(
      new ApiError(500, 'Internal Server Error')
    );
    renderPage(admin);

    await screen.findByText('Gothic');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Delete' })[0]!
    );
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Internal Server Error'
    );
  });

  it('reports a failure to load the list', async () => {
    mockedGenres.listGenres.mockRejectedValue(new Error('Network down'));
    renderPage(admin);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the genres.'
    );
  });

  it('shows an empty state when there are no genres yet', async () => {
    mockedGenres.listGenres.mockResolvedValue({ items: [] });
    renderPage(admin);

    expect(await screen.findByText('No genres yet.')).toBeInTheDocument();
  });
});
