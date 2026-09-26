import { screen, within } from '@testing-library/react';
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
import { useLocation } from 'react-router';
import type { FC } from 'react';
import * as measurePages from './measurePages';

jest.mock('@/api/books');
jest.mock('@/api/chapters');
jest.mock('./measurePages');

const measure = jest.mocked(measurePages);

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
  // jsdom lays nothing out: every chapter measures as three single pages.
  measure.measureGeometry.mockImplementation(() => ({
    pageWidth: 500,
    pageHeight: 600,
    perView: 1,
    gap: 32,
  }));
  measure.countPages.mockReturnValue(3);
  measure.pageOfChild.mockReturnValue(0);
  measure.childOnPage.mockReturnValue(0);
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

const inPages = {
  devicePreferences: {
    ...initialDevicePreferences,
    reading: { ...initialReadingPreferences, layout: 'pages' as const },
  },
};

const LocationState: FC = () => (
  <output aria-label="Location state">
    {JSON.stringify(useLocation().state)}
  </output>
);

const renderPagesAt = (chapterId: number) =>
  renderWithProviders(
    <>
      <ChapterPage />
      <LocationState />
    </>,
    {
      route: `/books/1/chapters/${chapterId}`,
      path: '/books/:bookId/chapters/:chapterId',
      preloadedState: inPages,
    }
  );

const arrows = (name: string) => screen.getAllByRole('button', { name });

describe('ChapterPage layout toggle', () => {
  it('switches from scroll to pages and back, naming the layout it goes to', async () => {
    const { store } = renderAt(9);
    await screen.findByRole('heading', { name: 'One' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to pages' })
    );

    expect(store.getState().devicePreferences.reading.layout).toBe('pages');
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Switch to scroll' })
    );

    expect(store.getState().devicePreferences.reading.layout).toBe('scroll');
    expect(screen.queryByText('Page 1 of 3')).not.toBeInTheDocument();
  });

  it('shows the same words in a tooltip', async () => {
    renderAt(9);
    await screen.findByRole('heading', { name: 'One' });

    await userEvent.hover(
      screen.getByRole('button', { name: 'Switch to pages' })
    );

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Switch to pages'
    );
  });
});

describe('ChapterPage in pages', () => {
  it('lays the chapter out as paragraphs under its title, with a live page count', async () => {
    mocked.getChapter.mockResolvedValue({
      id: 9,
      bookId: 1,
      title: 'One',
      text: 'It was a dark night.\n\nThe wind rose.',
      publishedAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    renderPagesAt(9);
    await screen.findByRole('heading', { name: 'One' });

    expect(screen.getByText('It was a dark night.')).toBeInTheDocument();
    expect(screen.getByText('The wind rose.')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toHaveAttribute(
      'aria-live',
      'polite'
    );
  });

  it('names a spread by both of its pages', async () => {
    measure.measureGeometry.mockImplementation(() => ({
      pageWidth: 500,
      pageHeight: 600,
      perView: 2,
      gap: 32,
    }));
    renderPagesAt(9);

    expect(await screen.findByText('Pages 1–2 of 3')).toBeInTheDocument();
  });

  it('turns pages with the top and the bottom arrows', async () => {
    renderPagesAt(10);
    await screen.findByText('Page 1 of 3');

    await userEvent.click(arrows('Next page')[0]!);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    await userEvent.click(arrows('Next page')[1]!);
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();

    await userEvent.click(arrows('Previous page')[1]!);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('opens the next chapter on its first page from the last page', async () => {
    renderPagesAt(10);
    await screen.findByText('Page 1 of 3');
    await userEvent.click(arrows('Next page')[0]!);
    await userEvent.click(arrows('Next page')[0]!);

    await userEvent.click(arrows('Next chapter: Three')[1]!);

    expect(
      await screen.findByRole('heading', { name: 'Three' })
    ).toBeInTheDocument();
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('opens the previous chapter on its last page from the first page, then forgets it', async () => {
    renderPagesAt(10);
    await screen.findByText('Page 1 of 3');

    await userEvent.click(arrows('Previous chapter: One')[0]!);

    expect(
      await screen.findByRole('heading', { name: 'One' })
    ).toBeInTheDocument();
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();
    // A reload keeps history state; replaced, it opens page 1 again.
    expect(screen.getByLabelText('Location state')).toHaveTextContent('null');
  });

  it('keeps the arrows disabled at either end of the book', async () => {
    renderPagesAt(9);
    await screen.findByText('Page 1 of 3');

    for (const arrow of arrows('Previous chapter')) {
      expect(arrow).toBeDisabled();
    }
  });

  it('disables next on the last page of the last chapter', async () => {
    renderPagesAt(11);
    await screen.findByText('Page 1 of 3');
    await userEvent.click(arrows('Next page')[0]!);
    await userEvent.click(arrows('Next page')[0]!);

    for (const arrow of arrows('Next chapter')) {
      expect(arrow).toBeDisabled();
    }
  });

  it('keeps focus on an arrow as it turns from a page into a chapter', async () => {
    renderPagesAt(10);
    await screen.findByText('Page 1 of 3');
    const bottomNext = within(
      screen.getByText('Page 1 of 3').parentElement!
    ).getByRole('button', { name: 'Next page' });

    await userEvent.click(bottomNext);
    await userEvent.click(bottomNext);

    expect(bottomNext).toHaveAccessibleName('Next chapter: Three');
    expect(bottomNext).toHaveFocus();
  });

  it('leaves the arrows as chapter links in scroll', async () => {
    renderAt(10);
    await screen.findByRole('heading', { name: 'Two' });

    expect(
      screen.getAllByRole('link', { name: 'Next chapter: Three' })[0]
    ).toHaveAttribute('href', '/books/1/chapters/11');
    expect(screen.queryByText(/^Page /)).not.toBeInTheDocument();
    expect(measure.measureGeometry).not.toHaveBeenCalled();
  });
});
