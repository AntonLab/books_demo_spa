import type { ReactElement } from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { ProfileBooksList } from './ProfileBooksList';
import { ProfileSeriesList } from './ProfileSeriesList';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import { devicePreferences } from '@/store/devicePreferencesSlice';
import * as booksApi from '@/api/books';
import * as favoritesApi from '@/api/favorites';
import * as genresApi from '@/api/genres';
import * as seriesApi from '@/api/series';
import type { PublicSeries, PublicUser } from '@/types/api';
import type { PublicBook } from '@/types/book';

jest.mock('@/api/books');
jest.mock('@/api/favorites');
jest.mock('@/api/genres');
jest.mock('@/api/series');
const mockedSeries = jest.mocked(seriesApi);
const mockedBooks = jest.mocked(booksApi);
const mockedFavorites = jest.mocked(favoritesApi);
const mockedGenres = jest.mocked(genresApi);

const ann = {
  id: 3,
  login: 'ann',
  firstName: 'Ann',
  lastName: 'Author',
  avatarUrl: null,
};
const author = {
  ...ann,
  email: 'a@x.test',
  status: 'active',
  role: 'author',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as PublicUser;
const book = (
  id: number,
  title: string,
  status: PublicBook['status'],
  favoriteId?: number
) =>
  ({
    id,
    title,
    status,
    authors: [ann],
    description: 'D.',
    tags: [],
    genre: null,
    coverUrl: null,
    seriesId: null,
    series: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...(favoriteId ? { favoriteId } : {}),
  }) as PublicBook;
const page = (items: PublicBook[], total = items.length) => ({
  items,
  total,
  current: 1,
  pageSize: 20,
});

const Probe = () => <div data-testid="search">{useLocation().search}</div>;
const renderAs = (ui: ReactElement, route = '/p') => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, author);
  return renderWithProviders(
    <>
      {ui}
      <Probe />
    </>,
    { queryClient, route }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenres.mockResolvedValue({ items: [] });
});

describe('ProfileBooksList in My works', () => {
  beforeEach(() => {
    mockedBooks.listBooks.mockResolvedValue(
      page([book(1, 'Private Draft', 'draft'), book(2, 'Out Now', 'complete')])
    );
  });

  it('lists the viewer’s books, Drafts included, full width even when the layout switch says grid', async () => {
    const onEdit = jest.fn();
    const { store } = renderAs(
      <ProfileBooksList scope="mine" viewerId={3} onEdit={onEdit} />
    );

    const link = await screen.findByRole('link', { name: 'Private Draft' });
    act(() => {
      store.dispatch(devicePreferences.resultsLayoutChanged('grid'));
    });
    expect(link.closest('.ant-col')).toHaveClass('ant-col-24');
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(mockedBooks.listBooks).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 3, current: 1, pageSize: 20 })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit Out Now' }));
    expect(onEdit).toHaveBeenCalledWith(2);
    expect(
      screen.getByRole('button', { name: 'Delete Out Now' })
    ).toBeInTheDocument();
  });

  it('hides the Author field of the form, and keeps the other books fields', async () => {
    renderAs(<ProfileBooksList scope="mine" viewerId={3} onEdit={jest.fn()} />);

    await screen.findByRole('link', { name: 'Out Now' });
    expect(screen.queryByLabelText('Author')).toBeNull();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('writes a picked Sort order to the URL', async () => {
    renderAs(<ProfileBooksList scope="mine" viewerId={3} onEdit={jest.fn()} />);

    await screen.findByRole('link', { name: 'Out Now' });
    await userEvent.click(screen.getByRole('radio', { name: 'New releases' }));

    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent('?sort=new')
    );
  });

  it('pages through the URL: a page, then a new size from page 1', async () => {
    mockedBooks.listBooks.mockResolvedValue(
      page([book(1, 'One', 'complete')], 145)
    );
    renderAs(<ProfileBooksList scope="mine" viewerId={3} onEdit={jest.fn()} />);

    await screen.findByRole('link', { name: 'One' });
    await userEvent.click(screen.getByTitle('3'));
    expect(screen.getByTestId('search')).toHaveTextContent('?page=3');
    await userEvent.click(screen.getByRole('combobox', { name: /page/i }));
    await userEvent.click(await screen.findByTitle('50 / page'));

    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent('?pageSize=50')
    );
  });

  it('closes the form behind a Filters button that counts the filters', async () => {
    const { store } = renderAs(
      <ProfileBooksList scope="mine" viewerId={3} onEdit={jest.fn()} />,
      '/p?q=dragon'
    );
    await screen.findByRole('link', { name: 'Out Now' });

    act(() => {
      store.dispatch(devicePreferences.searchFormExpandedChanged(false));
    });

    expect(screen.getByRole('button', { name: 'Filters (1)' })).toHaveAttribute(
      'aria-controls',
      'profile-filters'
    );
    expect(
      document.getElementById('profile-filters')?.parentElement
    ).toHaveAttribute('hidden');
  });
});

describe('ProfileBooksList in Favorites', () => {
  it('shows Author in the form, Remove on a row and no Edit or Delete', async () => {
    mockedBooks.listFavoritedBooks.mockResolvedValue(
      page([book(2, 'Out Now', 'complete', 41)]) as Awaited<
        ReturnType<typeof booksApi.listFavoritedBooks>
      >
    );
    mockedFavorites.deleteFavorite.mockResolvedValue(undefined);
    renderAs(
      <ProfileBooksList scope="favorites" viewerId={3} onEdit={jest.fn()} />
    );

    await screen.findByRole('link', { name: 'Out Now' });
    expect(screen.getByLabelText('Author')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Edit|Delete)/ })).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Out Now from favorites' })
    );

    await waitFor(() =>
      expect(mockedFavorites.deleteFavorite).toHaveBeenCalledWith(41)
    );
    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
  });
});

describe('ProfileSeriesList', () => {
  const series = {
    id: 12,
    title: 'The Scale Cycle',
    coverUrl: null,
    bookCount: 0,
    authors: [ann],
    description: 'Dragons.',
    tags: [],
    genre: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  } as PublicSeries;
  const seriesPage = (items: PublicSeries[]) => ({
    items,
    total: items.length,
    limit: 20,
    offset: 0,
  });

  it('My works: a row links to the series page, with Edit and Delete, and no Sort order or Author', async () => {
    mockedSeries.listSeries.mockResolvedValue(seriesPage([series]));
    const onEdit = jest.fn();
    renderAs(
      <ProfileSeriesList scope="mine" viewerId={3} onEdit={onEdit} />,
      '/p?tab=series'
    );

    expect(
      await screen.findByRole('link', { name: 'The Scale Cycle' })
    ).toHaveAttribute('href', '/series/12');
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit The Scale Cycle' })
    );
    expect(onEdit).toHaveBeenCalledWith(12);
    expect(
      screen.getByRole('button', { name: 'Delete The Scale Cycle' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Tag')).toBeInTheDocument();
    for (const label of ['Author', 'Status'])
      expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Sort by' })).toBeNull();
  });

  it('Favorites: removes by favorite id', async () => {
    mockedSeries.listFavoritedSeries.mockResolvedValue(
      seriesPage([{ ...series, favoriteId: 60 } as PublicSeries]) as Awaited<
        ReturnType<typeof seriesApi.listFavoritedSeries>
      >
    );
    mockedFavorites.deleteFavorite.mockResolvedValue(undefined);
    renderAs(
      <ProfileSeriesList scope="favorites" viewerId={3} onEdit={jest.fn()} />,
      '/p?tab=series'
    );

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Remove The Scale Cycle from favorites',
      })
    );

    await waitFor(() =>
      expect(mockedFavorites.deleteFavorite).toHaveBeenCalledWith(60)
    );
  });
});
