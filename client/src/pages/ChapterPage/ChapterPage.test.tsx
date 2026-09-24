import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChapterPage } from './ChapterPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import {
  initialDevicePreferences,
  initialReadingPreferences,
} from '@/store/devicePreferencesSlice';
import type { BookDetail } from '@/types/book';
import type { ChapterSummary } from '@/types/chapter';

jest.mock('@/api/books');
jest.mock('@/api/chapters');

const mocked = jest.mocked(chaptersApi);
const mockedBooks = jest.mocked(booksApi);

const book: BookDetail = {
  id: 1,
  authors: [
    {
      id: 3,
      login: 'ann',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
  ],
  seriesId: null,
  title: 'A Tale of Dragons',
  description: 'Long ago.',
  tags: [],
  status: 'in_progress',
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  series: null,
  likeCount: 0,
  viewerLikeId: null,
};

const summary = (id: number, title: string): ChapterSummary => ({
  id,
  bookId: 1,
  title,
  publishedAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const renderAt = (chapterId: number) =>
  renderWithProviders(<ChapterPage />, {
    route: `/books/1/chapters/${chapterId}`,
    path: '/books/:bookId/chapters/:chapterId',
  });

beforeEach(() => {
  jest.resetAllMocks();
  mockedBooks.getBook.mockResolvedValue(book);
  mocked.listChapters.mockResolvedValue({
    items: [summary(9, 'One'), summary(10, 'Two'), summary(11, 'Three')],
    total: 3,
    limit: 100,
    offset: 0,
  });
  mocked.getChapter.mockImplementation((id: number) =>
    Promise.resolve({
      id,
      bookId: 1,
      title: id === 9 ? 'One' : id === 10 ? 'Two' : 'Three',
      text: 'It was a dark night.',
      publishedAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
  );
});

describe('ChapterPage', () => {
  it('fetches the chapter named in the route', async () => {
    renderAt(9);

    await screen.findByRole('heading', { name: 'One' });

    expect(mocked.getChapter).toHaveBeenCalledWith(9);
  });

  it('renders the chapter body', async () => {
    renderAt(9);

    expect(
      await screen.findByRole('heading', { name: 'One' })
    ).toBeInTheDocument();
    expect(screen.getByText('It was a dark night.')).toBeInTheDocument();
  });

  it('opens the contents: the book and its chapters, this one marked', async () => {
    renderAt(10);
    await screen.findByRole('heading', { name: 'Two' });

    await userEvent.click(screen.getByRole('button', { name: 'Contents' }));

    expect(
      await screen.findByRole('link', { name: 'A Tale of Dragons' })
    ).toHaveAttribute('href', '/books/1');
    expect(screen.getByRole('link', { name: 'Two' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('offers the next chapter, and a disabled previous, on the first', async () => {
    renderAt(9);
    await screen.findByRole('heading', { name: 'One' });

    for (const link of screen.getAllByRole('link', {
      name: 'Next chapter: Two',
    })) {
      expect(link).toHaveAttribute('href', '/books/1/chapters/10');
    }
    for (const button of screen.getAllByRole('button', {
      name: 'Previous chapter',
    })) {
      expect(button).toBeDisabled();
    }
  });

  it('offers both around a middle chapter', async () => {
    renderAt(10);
    await screen.findByRole('heading', { name: 'Two' });

    expect(
      screen.getAllByRole('link', { name: 'Previous chapter: One' })[0]
    ).toHaveAttribute('href', '/books/1/chapters/9');
    expect(
      screen.getAllByRole('link', { name: 'Next chapter: Three' })[0]
    ).toHaveAttribute('href', '/books/1/chapters/11');
  });

  it('moves to the chapter an arrow names', async () => {
    renderAt(9);
    await screen.findByRole('heading', { name: 'One' });

    await userEvent.click(
      screen.getAllByRole('link', { name: 'Next chapter: Two' })[0]!
    );

    expect(
      await screen.findByRole('heading', { name: 'Two' })
    ).toBeInTheDocument();
  });

  it('offers a disabled next on the last chapter', async () => {
    renderAt(11);
    await screen.findByRole('heading', { name: 'Three' });

    expect(
      screen.getAllByRole('link', { name: 'Previous chapter: Two' })[0]
    ).toHaveAttribute('href', '/books/1/chapters/10');
    expect(
      screen.getAllByRole('button', { name: 'Next chapter' })[0]
    ).toBeDisabled();
  });

  it("sets the text in the reader's size and line height", async () => {
    renderWithProviders(<ChapterPage />, {
      route: '/books/1/chapters/9',
      path: '/books/:bookId/chapters/:chapterId',
      preloadedState: {
        devicePreferences: {
          ...initialDevicePreferences,
          reading: {
            ...initialReadingPreferences,
            fontSize: 22,
            lineHeight: 2,
          },
        },
      },
    });

    const text = await screen.findByText('It was a dark night.');

    expect(text.parentElement).toHaveStyle({
      fontSize: '22px',
      lineHeight: '2',
    });
  });

  it('reports a chapter that will not load', async () => {
    mocked.getChapter.mockRejectedValue(new Error('nope'));

    renderAt(9);

    expect(
      await screen.findByText('Could not load this chapter.')
    ).toBeInTheDocument();
  });
});

describe('ChapterPage navigation around chapters not yet out', () => {
  it('skips a draft and a scheduled chapter a co-author gets back in the list', async () => {
    mocked.listChapters.mockResolvedValue({
      items: [
        summary(9, 'One'),
        { ...summary(20, 'Unwritten'), publishedAt: null },
        {
          ...summary(21, 'Coming'),
          publishedAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
        summary(11, 'Three'),
      ],
      total: 4,
      limit: 100,
      offset: 0,
    });

    renderAt(9);
    await screen.findByRole('heading', { name: 'One' });

    expect(
      screen.getAllByRole('link', { name: 'Next chapter: Three' })[0]
    ).toHaveAttribute('href', '/books/1/chapters/11');
  });
});
