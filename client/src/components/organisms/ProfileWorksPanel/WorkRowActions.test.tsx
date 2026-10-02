import type { ReactElement } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookRowActions, SeriesRowActions } from './WorkRowActions';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { ApiError } from '@/api/client';
import * as booksApi from '@/api/books';
import * as favoritesApi from '@/api/favorites';
import * as seriesApi from '@/api/series';
import type { PublicSeries, PublicUser } from '@/types/api';
import type { PublicBook } from '@/types/book';
import type { ProfileScope } from '@/types/profileScope';

jest.mock('@/api/books');
jest.mock('@/api/favorites');
jest.mock('@/api/series');

const mockedBooks = jest.mocked(booksApi);
const mockedFavorites = jest.mocked(favoritesApi);
const mockedSeries = jest.mocked(seriesApi);

const credit = {
  id: 3,
  login: 'u3',
  firstName: 'U',
  lastName: '3',
  avatarUrl: null,
};
const viewer = (id: number, role: PublicUser['role']) =>
  ({ ...credit, id, role, status: 'active' }) as PublicUser;
const work = { authors: [credit], description: 'D.', tags: [], genre: null };
const book = {
  ...work,
  id: 7,
  title: 'Out Now',
  status: 'complete',
} as unknown as PublicBook;
const series = {
  ...work,
  id: 12,
  title: 'The Scale Cycle',
} as unknown as PublicSeries;

const renderAs = (who: PublicUser, ui: ReactElement) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, who);
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
  it('lets a Co-author edit, and delete after a confirmation with the editor page text', async () => {
    kind.remove.mockResolvedValue(undefined);
    const onEdit = jest.fn();
    renderAs(author, kind.ui('mine', onEdit));

    await userEvent.click(
      await screen.findByRole('button', { name: `Edit ${kind.title}` })
    );
    expect(onEdit).toHaveBeenCalledTimes(1);
    await userEvent.click(
      screen.getByRole('button', { name: `Delete ${kind.title}` })
    );
    expect(await screen.findByText(kind.confirm[0])).toBeInTheDocument();
    expect(screen.getByText(kind.confirm[1])).toBeInTheDocument();
    expect(kind.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(kind.remove).toHaveBeenCalledWith(kind.id));
    expect(
      await screen.findByText(`${kind.noun} deleted.`)
    ).toBeInTheDocument();
  });

  it('shows a viewer who may not edit nothing', () => {
    renderAs(viewer(9, 'author'), kind.ui('mine'));

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('toasts the server message when the delete fails, and refetches the lists', async () => {
    kind.remove.mockRejectedValue(new ApiError(404, 'Gone already'));
    const { queryClient } = renderAs(author, kind.ui('mine'));
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await userEvent.click(
      await screen.findByRole('button', { name: `Delete ${kind.title}` })
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );

    expect(await screen.findByText('Gone already')).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [kind.queryRoot] });
  });
});

describe.each(kinds)('$noun row actions in Favorites', (kind) => {
  const removeLabel = `Remove ${kind.title} from favorites`;

  it('removes by favorite id with no confirmation and no Edit or Delete', async () => {
    mockedFavorites.deleteFavorite.mockResolvedValue(undefined);
    renderAs(author, kind.ui('favorites', jest.fn(), 41));

    await userEvent.click(screen.getByRole('button', { name: removeLabel }));

    await waitFor(() =>
      expect(mockedFavorites.deleteFavorite).toHaveBeenCalledWith(41)
    );
    expect(screen.queryByRole('button', { name: /^(Edit|Delete)/ })).toBeNull();
  });

  it('toasts when the removal fails', async () => {
    mockedFavorites.deleteFavorite.mockRejectedValue(
      new ApiError(404, 'Favorite not found')
    );
    renderAs(author, kind.ui('favorites', jest.fn(), 42));

    await userEvent.click(screen.getByRole('button', { name: removeLabel }));

    expect(await screen.findByText('Favorite not found')).toBeInTheDocument();
  });

  it('shows no Remove for a row without a favorite id', () => {
    renderAs(author, kind.ui('favorites'));

    expect(screen.queryByRole('button')).toBeNull();
  });
});
