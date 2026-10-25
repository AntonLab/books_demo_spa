import type { ReactElement } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookRowActions, SeriesRowActions } from './WorkRowActions';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { seedSession } from '@/test/session';
import { clickWorkMenuItem, openWorkMenu } from '@/test/workMenu';
import { ApiError } from '@/api/client';
import * as booksApi from '@/api/books';
import * as favoritesApi from '@/api/favorites';
import * as seriesApi from '@/api/series';
import { publicBook, publicSeries } from '@/test/works';
import type { AuthorSummary, PublicUser } from '@/types/api';
import type { ProfileScope } from '@/types/profileScope';

jest.mock('@/api/books');
jest.mock('@/api/favorites');
jest.mock('@/api/series');

const mockedBooks = jest.mocked(booksApi);
const mockedFavorites = jest.mocked(favoritesApi);
const mockedSeries = jest.mocked(seriesApi);

const credit: AuthorSummary = {
  id: 3,
  login: 'u3',
  firstName: 'U',
  lastName: '3',
  status: 'active',
  avatarUrl: null,
};
const viewer = (id: number, role: PublicUser['role']) =>
  ({ ...credit, id, role }) as PublicUser;
const book = publicBook({
  id: 7,
  title: 'Out Now',
  status: 'complete',
  description: 'D.',
  authors: [credit],
});
const series = publicSeries({
  id: 12,
  title: 'The Scale Cycle',
  description: 'D.',
  authors: [credit],
});

const renderAs = (who: PublicUser, ui: ReactElement) => {
  const queryClient = createTestQueryClient();
  seedSession(queryClient, who);
  return renderWithProviders(ui, { queryClient });
};
const author = viewer(3, 'author');

const kinds = [
  {
    noun: 'Book',
    title: 'Out Now',
    confirm: [
      'Delete this book?',
      'Its chapters and comments are deleted with it.',
    ] as [string, string],
    remove: mockedBooks.deleteBook,
    id: 7,
    queryRoot: 'books',
    ui: (scope: ProfileScope, onEdit = jest.fn(), favoriteId?: number) => (
      <BookRowActions
        scope={scope}
        book={{ ...book, favoriteId }}
        onEdit={onEdit}
      />
    ),
  },
  {
    noun: 'Series',
    title: 'The Scale Cycle',
    confirm: ['Delete this series?', 'Its books stay, outside any series.'] as [
      string,
      string,
    ],
    remove: mockedSeries.deleteSeries,
    id: 12,
    queryRoot: 'series',
    ui: (scope: ProfileScope, onEdit = jest.fn(), favoriteId?: number) => (
      <SeriesRowActions
        scope={scope}
        series={{ ...series, favoriteId }}
        onEdit={onEdit}
      />
    ),
  },
];

beforeEach(() => {
  jest.resetAllMocks();
});

describe.each(kinds)('$noun row actions in My works', (kind) => {
  it('lets a Co-author edit, and delete after a confirmation with the same text as the edit modal', async () => {
    kind.remove.mockResolvedValue(undefined);
    const onEdit = jest.fn();
    renderAs(author, kind.ui('mine', onEdit));

    await clickWorkMenuItem(kind.title, 'Edit');
    expect(onEdit).toHaveBeenCalledTimes(1);
    await clickWorkMenuItem(kind.title, 'Delete');
    // modal.confirm renders its title twice (dialog label and body).
    expect(await screen.findAllByText(kind.confirm[0])).not.toHaveLength(0);
    expect(screen.getByText(kind.confirm[1])).toBeInTheDocument();
    expect(kind.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(kind.remove).toHaveBeenCalledWith(kind.id));
    expect(
      await screen.findByText(`${kind.noun} deleted.`)
    ).toBeInTheDocument();
  });

  it('deletes nothing when the confirmation is cancelled', async () => {
    renderAs(author, kind.ui('mine'));

    await clickWorkMenuItem(kind.title, 'Delete');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel' })
    );

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    );
    expect(kind.remove).not.toHaveBeenCalled();
  });

  it('shows a viewer who may not edit nothing', () => {
    renderAs(viewer(9, 'author'), kind.ui('mine'));

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers one More actions button and no separate Edit or Delete button', async () => {
    renderAs(author, kind.ui('mine'));

    expect(
      await screen.findByRole('button', {
        name: `More actions for ${kind.title}`,
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^(Edit|Delete) / })
    ).toBeNull();
  });

  it('toasts the server message when the delete fails, and refetches the lists', async () => {
    kind.remove.mockRejectedValue(new ApiError(404, 'Gone already'));
    const { queryClient } = renderAs(author, kind.ui('mine'));
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await clickWorkMenuItem(kind.title, 'Delete');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );

    expect(await screen.findByText('Gone already')).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [kind.queryRoot] });
  });
});

it('does not let one row block another row from removing its favorite', async () => {
  mockedFavorites.deleteFavorite.mockReturnValue(new Promise(() => {}));
  renderAs(
    author,
    <>
      <BookRowActions
        scope="favorites"
        book={{ ...book, favoriteId: 41 }}
        onEdit={jest.fn()}
      />
      <SeriesRowActions
        scope="favorites"
        series={{ ...series, favoriteId: 42 }}
        onEdit={jest.fn()}
      />
    </>
  );

  await clickWorkMenuItem(book.title, 'Remove from favorites');
  await openWorkMenu(series.title);
  // Closed menus stay in the DOM (zeroRuntime); pick the one not hidden.
  const menu = (await screen.findAllByRole('menu')).find(
    (m) =>
      !m.closest('.ant-dropdown')?.classList.contains('ant-dropdown-hidden')
  )!;
  await userEvent.click(
    within(menu).getByRole('menuitem', { name: 'Remove from favorites' })
  );

  expect(mockedFavorites.deleteFavorite).toHaveBeenCalledTimes(2);
  expect(mockedFavorites.deleteFavorite).toHaveBeenCalledWith(41);
  expect(mockedFavorites.deleteFavorite).toHaveBeenCalledWith(42);
});

describe.each(kinds)('$noun row actions in Favorites', (kind) => {
  const removeItem = () =>
    screen.findByRole('menuitem', { name: 'Remove from favorites' });

  it('removes by favorite id with no confirmation and no Edit or Delete menu item', async () => {
    mockedFavorites.deleteFavorite.mockResolvedValue(undefined);
    renderAs(author, kind.ui('favorites', jest.fn(), 41));

    await openWorkMenu(kind.title);
    expect(
      screen.queryByRole('menuitem', { name: /^(Edit|Delete)$/ })
    ).toBeNull();
    await userEvent.click(await removeItem());

    await waitFor(() =>
      expect(mockedFavorites.deleteFavorite).toHaveBeenCalledWith(41)
    );
  });

  it('sends one removal for a double click', async () => {
    mockedFavorites.deleteFavorite.mockReturnValue(new Promise(() => {}));
    renderAs(author, kind.ui('favorites', jest.fn(), 41));

    await openWorkMenu(kind.title);
    await userEvent.dblClick(await removeItem());

    expect(mockedFavorites.deleteFavorite).toHaveBeenCalledTimes(1);
    expect(mockedFavorites.deleteFavorite).toHaveBeenCalledWith(41);
  });

  it('toasts once and allows a retry when the removal fails', async () => {
    mockedFavorites.deleteFavorite
      .mockRejectedValueOnce(new ApiError(404, 'Favorite not found'))
      .mockResolvedValueOnce(undefined);
    renderAs(author, kind.ui('favorites', jest.fn(), 43));

    await clickWorkMenuItem(kind.title, 'Remove from favorites');
    expect(await screen.findByText('Favorite not found')).toBeInTheDocument();
    await clickWorkMenuItem(kind.title, 'Remove from favorites');

    await waitFor(() =>
      expect(mockedFavorites.deleteFavorite).toHaveBeenCalledTimes(2)
    );
  });

  it('toasts when the removal fails', async () => {
    mockedFavorites.deleteFavorite.mockRejectedValue(
      new ApiError(404, 'Favorite not found')
    );
    renderAs(author, kind.ui('favorites', jest.fn(), 42));

    await clickWorkMenuItem(kind.title, 'Remove from favorites');

    expect(await screen.findByText('Favorite not found')).toBeInTheDocument();
  });

  it('shows no More actions button for a row without a favorite id', () => {
    renderAs(author, kind.ui('favorites'));

    expect(screen.queryByRole('button')).toBeNull();
  });
});
