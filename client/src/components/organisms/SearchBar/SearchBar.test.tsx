import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { SearchBar } from './SearchBar';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import * as seriesApi from '@/api/series';
import type { PublicBook } from '@/types/book';
import type { PublicSeries } from '@/types/api';

jest.mock('@/api/books');
jest.mock('@/api/series');

const mockedBooks = jest.mocked(booksApi);
const mockedSeries = jest.mocked(seriesApi);

beforeEach(() => {
  jest.resetAllMocks();
});

// Renders the current URL so a test can assert where the bar navigated to.
const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
};

// A search on Enter navigates a microtask later (so a pick in the same
// keydown can cancel it); let that and its render finish before reading the
// URL, which also makes a "did nothing" assertion mean it.
const settle = () => act(async () => {});

// One settle() is not enough to see a navigation that did happen: under a
// loaded full run the render lands later, and the URL still reads '/'.
const expectLocation = (path: string) =>
  waitFor(() => {
    expect(screen.getByTestId('location').textContent).toBe(path);
  });

const renderBar = (route = '/') => {
  return renderWithProviders(
    <>
      <SearchBar />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </>,
    { route }
  );
};

describe('SearchBar', () => {
  it('navigates to /search with the encoded term on submit', async () => {
    renderBar();

    await userEvent.type(
      screen.getByLabelText('Search books'),
      'dragon riders{Enter}'
    );

    await expectLocation('/search?q=dragon%20riders');
  });

  it('trims surrounding whitespace from the term', async () => {
    renderBar();

    await userEvent.type(
      screen.getByLabelText('Search books'),
      '  elf  {Enter}'
    );

    await expectLocation('/search?q=elf');
  });

  it('does nothing when the term is empty', async () => {
    renderBar();

    await userEvent.type(screen.getByLabelText('Search books'), '{Enter}');
    await settle();

    // Exact match, not toHaveTextContent: '/search?q=' contains '/' as a
    // substring, so a substring assertion here would pass even with the
    // empty-term guard deleted entirely.
    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('does nothing when the term is only whitespace', async () => {
    renderBar();

    await userEvent.type(screen.getByLabelText('Search books'), '   {Enter}');
    await settle();

    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('caps the input at the 200 characters the server accepts', () => {
    renderBar();

    expect(screen.getByLabelText('Search books')).toHaveAttribute(
      'maxlength',
      '200'
    );
  });

  it('initialises from ?q= so it stays populated on /search', () => {
    renderBar('/search?q=dragon');

    expect(screen.getByLabelText('Search books')).toHaveValue('dragon');
  });

  it('says it searches titles and descriptions, which is what the server matches', () => {
    renderBar();

    expect(screen.getByLabelText('Search books')).toHaveAttribute(
      'placeholder',
      'Search books by title or description'
    );
  });

  it('does not navigate when the clear (x) icon is clicked', async () => {
    // antd 6's Input.Search fires onSearch for its clear icon too, with
    // info.source === 'clear' — confirmed by inspecting the rendered DOM,
    // which is a <button class="ant-input-clear-icon"> inside the input's
    // suffix. Without the source==='clear' guard in SearchBar, clicking it
    // would navigate to a search for the term the user just erased.
    const { container } = renderBar('/search?q=dragon');

    const clearIcon = container.querySelector('.ant-input-clear-icon');
    expect(clearIcon).not.toBeNull();

    await userEvent.click(clearIcon as HTMLElement);

    expect(screen.getByTestId('location').textContent).toBe('/search?q=dragon');
  });
});

describe('SearchBar suggestions', () => {
  const ann = {
    id: 3,
    login: 'annlee',
    firstName: 'Ann',
    lastName: 'Dragonfly',
    avatarUrl: null,
  };
  const bookOf = (id: number, title: string, authors = [ann]): PublicBook =>
    ({ id, title, authors }) as Partial<PublicBook> as PublicBook;
  const pageOf = (items: PublicBook[]) => ({
    items,
    total: items.length,
    current: 1,
    pageSize: 8,
  });

  beforeEach(() => {
    mockedBooks.listBooks.mockImplementation(async (params = {}) =>
      params.q !== undefined
        ? pageOf(
            [1, 2, 3, 4, 5, 6].map((id) => bookOf(id, `Dragon Tale ${id}`))
          )
        : pageOf([bookOf(9, 'Other', [ann])])
    );
    mockedSeries.listSeries.mockResolvedValue({
      items: [{ id: 2, title: 'Dragon Saga' } as PublicSeries],
      total: 1,
      limit: 8,
      offset: 0,
    });
  });

  it('asks for nothing for the ?q= it starts from', async () => {
    renderBar('/search?q=dragon');
    await settle();

    expect(mockedBooks.listBooks).not.toHaveBeenCalled();
    expect(mockedSeries.listSeries).not.toHaveBeenCalled();
  });

  it('groups books, authors and series, five at most in each', async () => {
    renderBar();

    await userEvent.type(screen.getByLabelText('Search books'), 'drag');

    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      q: 'drag',
      pageSize: 8,
    });
    expect(mockedBooks.listBooks).toHaveBeenCalledWith({
      author: 'drag',
      pageSize: 8,
    });
    expect(mockedSeries.listSeries).toHaveBeenCalledWith({
      q: 'drag',
      limit: 8,
    });
    expect(await screen.findByTitle('Dragon Saga')).toBeInTheDocument();
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('Authors')).toBeInTheDocument();
    expect(screen.getByText('Series')).toBeInTheDocument();
    expect(screen.getByTitle('Dragon Tale 5')).toBeInTheDocument();
    expect(screen.queryByTitle('Dragon Tale 6')).not.toBeInTheDocument();
  });

  it('leaves out a group with nothing in it', async () => {
    mockedSeries.listSeries.mockResolvedValue({
      items: [],
      total: 0,
      limit: 8,
      offset: 0,
    });
    renderBar();

    await userEvent.type(screen.getByLabelText('Search books'), 'drag');

    await screen.findByTitle('Dragon Tale 1');
    expect(screen.queryByText('Series')).not.toBeInTheDocument();
  });

  it.each([
    ['Dragon Tale 1', '/books/1'],
    ['Ann Dragonfly (annlee)', '/search?author=annlee&authorId=3'],
    ['Dragon Saga', '/series/2'],
  ])('opens %s where it belongs and empties the bar', async (title, path) => {
    renderBar();

    await userEvent.type(screen.getByLabelText('Search books'), 'drag');
    await userEvent.click(await screen.findByTitle(title));

    expect(screen.getByTestId('location').textContent).toBe(path);
    expect(screen.getByLabelText('Search books')).toHaveValue('');
  });

  it('searches the typed text on Enter while suggestions are open', async () => {
    renderBar();

    await userEvent.type(screen.getByLabelText('Search books'), 'drag');
    await screen.findByTitle('Dragon Tale 1');
    await userEvent.keyboard('{Enter}');

    await expectLocation('/search?q=drag');
  });
});
