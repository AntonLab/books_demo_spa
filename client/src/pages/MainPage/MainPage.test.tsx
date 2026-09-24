import { screen, within } from '@testing-library/react';
import { MainPage } from './MainPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import type { BookSort, PublicBook } from '@/types/book';

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
      limit: 6,
      offset: 0,
    };
  });
};

const section = (name: string) => screen.getByRole('region', { name });

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
      expect(mockedBooks.listBooks).toHaveBeenCalledWith({ sort, limit: 6 });
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
    ).toHaveAttribute('href', '/search?sort=popular');
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
});
