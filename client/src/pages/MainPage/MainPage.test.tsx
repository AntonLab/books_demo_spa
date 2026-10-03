import { screen, waitFor, within } from '@testing-library/react';
import { MainPage } from './MainPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as booksApi from '@/api/books';
import type { BookSort } from 'shared';
import type { PublicBook } from '@/types/book';
import type { PublicUser } from '@/types/api';

jest.mock('@/api/books');

const mockedBooks = jest.mocked(booksApi);

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
  series: null,
  title: 'A Tale of Dragons',
  description: 'A tale of dragons',
  tags: ['epic'],
  status: 'in_progress',
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

type Answer = { titles: string[]; total?: number } | Error;

// One answer per ranking; each section asks for its own.
const answerBySort = (answers: Record<BookSort, Answer>) => {
  mockedBooks.listBooks.mockImplementation(async (params = {}) => {
    const answer = answers[params.sort ?? 'popular'];
    if (answer instanceof Error) throw answer;
    return {
      items: answer.titles.map((title, index) => ({
        ...book,
        id: index + 1,
        title,
      })),
      total: answer.total ?? answer.titles.length,
      current: 1,
      pageSize: 6,
    };
  });
};

const section = (name: string) => screen.getByRole('region', { name });

const titled = (id: number): PublicBook => ({
  ...book,
  id,
  title: `Viewed ${id}`,
});

// `viewed` is what the server returns for an ids request, id-ascending.
const answerWithViewed = (viewed: PublicBook[] | Error | 'never') => {
  mockedBooks.listBooks.mockImplementation(async (params = {}) => {
    if (params.ids !== undefined) {
      if (viewed === 'never') return new Promise(() => {});
      if (viewed instanceof Error) throw viewed;
      return { items: viewed, total: viewed.length, current: 1, pageSize: 20 };
    }
    return { items: [book], total: 1, current: 1, pageSize: 6 };
  });
};

const history = (ids: number[], accountId: number | null = null) => ({
  recentlyViewed: { accountId, ids },
});

// The heading of the page's first section.
const firstSectionHeading = () => {
  const [first] = screen.getAllByRole('region');
  if (first === undefined) throw new Error('No section on the page');
  return within(first).getByRole('heading', { level: 2 }).textContent;
};

const account = (id: number): PublicUser => ({
  id,
  login: `user${id}`,
  email: `user${id}@example.com`,
  firstName: 'Ann',
  lastName: 'Author',
  status: 'active',
  role: 'author',
  avatarUrl: null,
  about: '',
  showLastSeen: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('MainPage', () => {
  it('shows each section with up to six books of its own ranking', async () => {
    answerBySort({
      popular: { titles: ['Loved'] },
      new: { titles: ['Fresh'] },
      updated: { titles: ['Ongoing'] },
    });

    renderWithProviders(<MainPage />);

    expect(
      await within(section('Recently updated')).findByRole('link', {
        name: 'Ongoing',
      })
    ).toBeInTheDocument();
    expect(
      within(section('Popular')).getByRole('link', { name: 'Loved' })
    ).toBeInTheDocument();
    expect(
      within(section('New releases')).getByRole('link', { name: 'Fresh' })
    ).toBeInTheDocument();
    for (const sort of ['popular', 'new', 'updated']) {
      expect(mockedBooks.listBooks).toHaveBeenCalledWith({ sort, pageSize: 6 });
    }
  });

  it('links Show more to the full ranking only when a section holds more than six', async () => {
    const six = ['A', 'B', 'C', 'D', 'E', 'F'];
    answerBySort({
      popular: { titles: six, total: 7 },
      new: { titles: six },
      updated: { titles: [] },
    });

    renderWithProviders(<MainPage />);

    expect(
      await within(section('Popular')).findByRole('link', { name: 'Show more' })
    ).toHaveAttribute('href', '/search');
    await within(section('New releases')).findByRole('link', { name: 'A' });
    expect(
      within(section('New releases')).queryByRole('link', {
        name: 'Show more',
      })
    ).not.toBeInTheDocument();
  });

  it('shows a failed section its error while the others still load', async () => {
    answerBySort({
      popular: { titles: ['Loved'] },
      new: new Error('Network down'),
      updated: { titles: ['Ongoing'] },
    });

    renderWithProviders(<MainPage />);

    expect(
      await within(section('New releases')).findByRole('alert')
    ).toHaveTextContent('Network down');
    expect(
      await within(section('Popular')).findByRole('link', { name: 'Loved' })
    ).toBeInTheDocument();
  });

  it('keeps an empty section in place with the empty text', async () => {
    answerBySort({
      popular: { titles: ['Loved'] },
      new: { titles: ['Fresh'] },
      updated: { titles: [] },
    });

    renderWithProviders(<MainPage />);

    expect(
      await within(section('Recently updated')).findByText('No books yet.')
    ).toBeInTheDocument();
  });

  describe('Recently viewed', () => {
    const viewedLinks = (region: HTMLElement) =>
      within(region)
        .getAllByRole('link', { name: /^Viewed/ })
        .map((link) => link.textContent);
    const calledWithIds = () =>
      mockedBooks.listBooks.mock.calls.some(
        ([params]) => params?.ids !== undefined
      );

    it('shows no section on a fresh device and starts with Popular', async () => {
      answerWithViewed([]);

      renderWithProviders(<MainPage />);

      await screen.findByRole('link', { name: 'A Tale of Dragons' });
      expect(
        screen.queryByRole('region', { name: 'Recently viewed' })
      ).not.toBeInTheDocument();
      expect(firstSectionHeading()).toBe('Popular');
      expect(calledWithIds()).toBe(false);
    });

    it('puts the section first and lists the history newest first, with no Show more', async () => {
      answerWithViewed([1, 2, 3].map(titled));

      renderWithProviders(<MainPage />, {
        preloadedState: history([3, 1, 2]),
      });

      const region = await screen.findByRole('region', {
        name: 'Recently viewed',
      });
      expect(screen.getAllByRole('region')[0]).toBe(region);
      await within(region).findByRole('link', { name: 'Viewed 3' });
      expect(viewedLinks(region)).toEqual(['Viewed 3', 'Viewed 1', 'Viewed 2']);
      expect(
        within(region).queryByRole('link', { name: 'Show more' })
      ).not.toBeInTheDocument();
      expect(mockedBooks.listBooks).toHaveBeenCalledWith({
        ids: '1,2,3',
        pageSize: 20,
      });
    });

    it('shows only the latest six', async () => {
      const ids = [8, 7, 6, 5, 4, 3, 2, 1];
      answerWithViewed([...ids].reverse().map(titled));

      renderWithProviders(<MainPage />, { preloadedState: history(ids) });

      const region = await screen.findByRole('region', {
        name: 'Recently viewed',
      });
      await within(region).findByRole('link', { name: 'Viewed 8' });
      const links = viewedLinks(region);
      expect(links).toHaveLength(6);
      expect(links[0]).toBe('Viewed 8');
      expect(links[5]).toBe('Viewed 3');
    });

    it('shows the loading state while its Books load', async () => {
      answerWithViewed('never');

      renderWithProviders(<MainPage />, { preloadedState: history([1]) });

      const region = await screen.findByRole('region', {
        name: 'Recently viewed',
      });
      expect(
        within(region).getByRole('status', { name: 'Loading books' })
      ).toBeInTheDocument();
    });

    it('hides the section when every Book dropped out, with no empty message', async () => {
      answerWithViewed([]);

      renderWithProviders(<MainPage />, { preloadedState: history([1, 2]) });

      await screen.findByRole('link', { name: 'A Tale of Dragons' });
      await waitFor(() => expect(calledWithIds()).toBe(true));
      expect(
        screen.queryByRole('region', { name: 'Recently viewed' })
      ).not.toBeInTheDocument();
      expect(screen.queryByText('No books yet.')).not.toBeInTheDocument();
    });

    it('hides the section when its load fails, and the other sections stay', async () => {
      answerWithViewed(new Error('Network down'));

      renderWithProviders(<MainPage />, { preloadedState: history([1]) });

      await screen.findByRole('link', { name: 'A Tale of Dragons' });
      await waitFor(() => expect(calledWithIds()).toBe(true));
      expect(
        screen.queryByRole('region', { name: 'Recently viewed' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it("hides another Account's history", async () => {
      answerWithViewed([titled(1)]);
      const queryClient = createTestQueryClient();
      queryClient.setQueryData(queryKeys.session, account(5));

      renderWithProviders(<MainPage />, {
        queryClient,
        preloadedState: history([1], 3),
      });

      await screen.findByRole('link', { name: 'A Tale of Dragons' });
      expect(
        screen.queryByRole('region', { name: 'Recently viewed' })
      ).not.toBeInTheDocument();
      expect(calledWithIds()).toBe(false);
    });
  });
});
