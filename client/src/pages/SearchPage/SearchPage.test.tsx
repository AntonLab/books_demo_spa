import { initialReadingPreferences } from '@/store/devicePreferencesSlice';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { SearchPage } from './SearchPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import type { PublicBook } from '@/types/book';
import type { PagedResponse } from 'shared';
import type { RootState } from '@/store';

// What the page shows for each state `useSearchPage` reports; what it reads
// from and writes to the URL is tested in useSearchPage.test.tsx.

jest.mock('@/api/books');
jest.mock('@/api/genres');

const mockedBooks = jest.mocked(booksApi);
const mockedGenres = jest.mocked(genresApi);

const book: PublicBook = {
  id: 1,
  authors: [
    {
      id: 3,
      login: 'Author',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
  ],
  seriesId: null,
  title: 'A Tale of Dragons',
  description: 'A tale of dragons',
  tags: ['epic'],
  status: 'in_progress',
  genre: { id: 4, name: 'Gothic' },
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

// Serves whatever page is asked for, as the server does short of the end, so
// the page never follows a `current` it did not ask for.
const serve = (overrides: Partial<PagedResponse<PublicBook>> = {}) =>
  mockedBooks.listBooks.mockImplementation(async (params = {}) => ({
    items: [book],
    total: 1,
    current: params.current ?? 1,
    pageSize: 20,
    ...overrides,
  }));

const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
};

const renderPage = (route: string, preloadedState?: Partial<RootState>) =>
  renderWithProviders(
    <>
      <SearchPage />
      <LocationProbe />
    </>,
    { route, preloadedState }
  );

const location = () => screen.getByTestId('location').textContent;

const collapsed: Partial<RootState> = {
  devicePreferences: {
    theme: 'light',
    resultsLayout: 'grid',
    searchFormExpanded: false,
    reading: initialReadingPreferences,
  },
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenres.mockResolvedValue({
    items: [{ id: 4, name: 'Gothic' }],
  });
  serve();
});

describe('SearchPage', () => {
  it('shows the results, their count in the title', async () => {
    renderPage('/search');

    expect(
      await screen.findByRole('link', { name: 'A Tale of Dragons' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Search results · 1 book' })
    ).toBeInTheDocument();
  });

  it('keeps the last count in the title while the next search runs', async () => {
    serve({ total: 45 });
    renderPage('/search?q=dragon');
    await screen.findByRole('heading', { name: 'Search results · 45 books' });
    mockedBooks.listBooks.mockImplementation(() => new Promise(() => {}));

    await userEvent.click(screen.getByRole('radio', { name: 'New releases' }));

    await waitFor(() => expect(location()).toBe('/search?q=dragon&sort=new'));
    expect(
      screen.getByRole('heading', { name: 'Search results · 45 books' })
    ).toBeInTheDocument();
  });

  it('says it is searching until a first count is known', () => {
    mockedBooks.listBooks.mockImplementation(() => new Promise(() => {}));

    renderPage('/search');

    return expect(
      screen.findByRole('heading', { name: 'Search results · Searching…' })
    ).resolves.toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    serve({ items: [], total: 0 });

    renderPage('/search?q=zzz');

    expect(
      await screen.findByText('No books match this search.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Search results · 0 books' })
    ).toBeInTheDocument();
  });

  it('turns the page from the pagination', async () => {
    serve({ total: 45 });
    renderPage('/search?q=dragon');
    await screen.findByRole('link', { name: 'A Tale of Dragons' });

    await userEvent.click(screen.getByTitle('2'));

    expect(location()).toBe('/search?q=dragon&page=2');
  });

  it('shows tiles by default and switches to a list the device keeps', async () => {
    const { store } = renderPage('/search?q=dragon');

    await screen.findByRole('link', { name: 'A Tale of Dragons' });
    // A tile leaves the description out; the list's card shows it.
    expect(screen.queryByText('A tale of dragons')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'List' }));

    expect(screen.getByText('A tale of dragons')).toBeInTheDocument();
    expect(store.getState().devicePreferences.resultsLayout).toBe('list');
  });

  it('hides the closed form, counting its filters, and opens it on Filters', async () => {
    renderPage('/search?q=dragon&status=complete', collapsed);

    await screen.findByText('Filters (2)');
    // A Sort order is no Search filter: it stays in view with the form shut.
    expect(
      screen.getByRole('radiogroup', { name: 'Sort by' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Search' })
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Filters (2)' }));

    expect(screen.getByRole('button', { name: 'Search' })).toBeVisible();
  });

  it('says a gone genre is gone, keeping the form filled and no layout switch', async () => {
    renderPage('/search?genre=99&q=dragon');

    expect(
      await screen.findByText('This genre no longer exists.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toHaveValue('dragon');
    expect(
      screen.queryByRole('button', { name: 'List' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radiogroup', { name: 'Sort by' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Search results' })
    ).toBeInTheDocument();
  });

  it('reports a genre list that failed', async () => {
    mockedGenres.listGenres.mockRejectedValue(new Error('Network down'));

    renderPage('/search?genre=4');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the genres.'
    );
  });
});

describe('SearchPage Sort order', () => {
  it('searches with the typed text under a picked Sort order, from page 1', async () => {
    serve({ total: 45 });
    renderPage('/search?q=dragon&page=2');
    await screen.findByRole('link', { name: 'A Tale of Dragons' });
    expect(screen.getByRole('radio', { name: 'Popular' })).toBeChecked();

    // Typed but never submitted with the Search button.
    await userEvent.clear(screen.getByLabelText('Text'));
    await userEvent.type(screen.getByLabelText('Text'), 'wyrm');
    await userEvent.click(screen.getByRole('radio', { name: 'New releases' }));

    await waitFor(() => expect(location()).toBe('/search?q=wyrm&sort=new'));
    expect(screen.getByRole('radio', { name: 'New releases' })).toBeChecked();
  });

  it('keeps the Sort order and opens the form when a pick meets a broken rule', async () => {
    const route = '/search?updatedFrom=2026-02-01&updatedTo=2026-01-01';
    const { store } = renderPage(route, collapsed);
    await screen.findByRole('link', { name: 'A Tale of Dragons' });

    await userEvent.click(screen.getByRole('radio', { name: 'New releases' }));

    expect(
      await screen.findByText('Must not be after the end date.')
    ).toBeInTheDocument();
    expect(store.getState().devicePreferences.searchFormExpanded).toBe(true);
    expect(screen.getByRole('button', { name: 'Search' })).toBeVisible();
    expect(location()).toBe(route);
    expect(screen.getByRole('radio', { name: 'Popular' })).toBeChecked();
  });

  it('moves one Sort order per arrow key, keeping focus in the group', async () => {
    renderPage('/search');
    await screen.findByRole('link', { name: 'A Tale of Dragons' });
    const popular = screen.getByRole('radio', { name: 'Popular' });
    popular.focus();

    // Not `userEvent.keyboard`: it walks radios without a `name` as one
    // group and moves the check itself, a second change no browser makes.
    fireEvent.keyDown(popular, { key: 'ArrowRight' });

    await waitFor(() => expect(location()).toBe('/search?sort=new'));
    expect(
      screen.getByRole('radiogroup', { name: 'Sort by' })
    ).toContainElement(document.activeElement as HTMLElement);
  });

  it('keeps the Sort order on Search, and Reset clears it', async () => {
    serve({ total: 45 });
    renderPage('/search?q=dragon&sort=new&page=2');
    await screen.findByRole('link', { name: 'A Tale of Dragons' });

    // Search drops the page, so a changed URL proves the submit happened.
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(location()).toBe('/search?q=dragon&sort=new'));

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(location()).toBe('/search'));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Popular' })).toBeChecked()
    );
  });
});
