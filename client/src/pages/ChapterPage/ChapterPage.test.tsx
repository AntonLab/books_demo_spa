import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { EMPTY_LIBRARY_COUNTS } from 'shared';
import userEvent from '@testing-library/user-event';
import { ChapterPage } from './ChapterPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { createTestQueryClient } from '@/test/queryClient';
import { seedSession } from '@/test/session';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import * as illustrationsApi from '@/api/illustrations';
import * as libraryApi from '@/api/library';
import { publicBook } from '@/test/works';
import {
  initialDevicePreferences,
  initialReadingPreferences,
} from '@/store/devicePreferencesSlice';
import type { BookDetail } from '@/types/book';
import type { ChapterSummary } from '@/types/chapter';
import { Route, Routes, useLocation, useNavigationType } from 'react-router';
import { ApiError } from '@/api/client';
import { BookPage } from '@/pages/BookPage/BookPage';
import { StrictMode } from 'react';
import type { FC } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@/types/api';
import * as measurePages from './measurePages';

jest.mock('@/api/books');
jest.mock('@/api/chapters');
jest.mock('@/api/illustrations');
jest.mock('@/api/library');
jest.mock('./measurePages');

const measure = jest.mocked(measurePages);
const mockedIllustrations = jest.mocked(illustrationsApi);
const mockedLibrary = jest.mocked(libraryApi);

// jsdom has no IntersectionObserver: a fake whose test reports the sentinel
// coming into view.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = () => [];
  report(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

const sentinelComesIntoView = () => {
  const { instances } = FakeIntersectionObserver;
  const observer = instances[instances.length - 1]!;
  act(() => {
    observer.report(true);
  });
};

const reader: PublicUser = {
  id: 9,
  login: 'Reader',
  email: 'reader@example.com',
  firstName: 'Read',
  lastName: 'Er',
  status: 'active',
  role: 'user',
  avatarUrl: null,
  about: '',
  showLastSeen: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
// The Book's only author, id 3.
const coAuthor: PublicUser = { ...reader, id: 3, login: 'ann' };

const signedIn = (user: PublicUser) => {
  const queryClient = createTestQueryClient();
  seedSession(queryClient, user);
  return queryClient;
};

const mocked = jest.mocked(chaptersApi);
const mockedBooks = jest.mocked(booksApi);

const book: BookDetail = {
  ...publicBook({
    authors: [
      {
        id: 3,
        login: 'ann',
        firstName: 'Ann',
        lastName: 'Author',
        status: 'active',
        avatarUrl: null,
      },
    ],
    title: 'A Tale of Dragons',
    description: 'Long ago.',
    status: 'in_progress',
  }),
  likeCount: 0,
  commentCount: 0,
  wordCount: 0,
  favoriteCount: 0,
  viewerFavoriteId: null,
  viewerReadingStatus: null,
  libraryCounts: EMPTY_LIBRARY_COUNTS,
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

const renderAt = (chapterId: number, queryClient?: QueryClient) =>
  renderWithProviders(<ChapterPage />, {
    route: `/books/1/chapters/${chapterId}`,
    path: '/books/:bookId/chapters/:chapterId',
    queryClient,
  });

const Probe: FC = () => {
  const { pathname } = useLocation();
  return <p>{`${pathname}|${useNavigationType()}`}</p>;
};

const renderWithRoutes = (chapterId: string, bookId = '1') =>
  renderWithProviders(
    <Routes>
      <Route
        path="/books/:bookId/chapters/:chapterId"
        element={<ChapterPage />}
      />
      <Route path="/books/:id" element={<BookPage />} />
      <Route path="/" element={<Probe />} />
    </Routes>,
    { route: `/books/${bookId}/chapters/${chapterId}` }
  );

beforeEach(() => {
  jest.resetAllMocks();
  FakeIntersectionObserver.instances = [];
  window.IntersectionObserver =
    FakeIntersectionObserver as unknown as typeof IntersectionObserver;
  mockedLibrary.postReadingProgress.mockResolvedValue(undefined);
  mockedBooks.getBook.mockResolvedValue(book);
  mockedIllustrations.listIllustrations.mockResolvedValue({ items: [] });
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
  measure.trailingSpace.mockReturnValue(0);
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
    expect(screen.getByRole('link', { name: '2. Two' })).toHaveAttribute(
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

  it('replaces to the Book page when the chapter is gone', async () => {
    mocked.getChapter.mockRejectedValue(new ApiError(404, 'gone'));
    renderWithRoutes('5');
    expect(
      await screen.findAllByText('This chapter no longer exists.')
    ).toHaveLength(1);
    expect(
      await screen.findByRole('heading', { name: book.title })
    ).toBeInTheDocument();
  });

  it("records the chapter's Book once the chapter has loaded", async () => {
    const { store } = renderAt(9);

    await screen.findByRole('heading', { name: 'One' });

    await waitFor(() =>
      expect(store.getState().recentlyViewed.ids).toEqual([1])
    );
  });

  it('does not record a Draft Book', async () => {
    mockedBooks.getBook.mockResolvedValue({ ...book, status: 'draft' });

    const { store } = renderAt(9);
    await screen.findByRole('heading', { name: 'One' });
    await waitFor(() => expect(mockedBooks.getBook).toHaveBeenCalled());

    expect(store.getState().recentlyViewed.ids).toEqual([]);
  });

  it('records nothing when the chapter is gone', async () => {
    mocked.getChapter.mockRejectedValue(new ApiError(404, 'gone'));

    const { store } = renderAt(5);
    await screen.findAllByText('This chapter no longer exists.');

    expect(store.getState().recentlyViewed.ids).toEqual([]);
  });

  it('goes on Home when the Book is gone too', async () => {
    mocked.getChapter.mockRejectedValue(new ApiError(404, 'gone'));
    mockedBooks.getBook.mockRejectedValue(new ApiError(404, 'gone'));
    renderWithRoutes('5');
    expect(await screen.findByText('/|REPLACE')).toBeInTheDocument();
    expect(
      await screen.findAllByText('This book no longer exists.')
    ).toHaveLength(1);
  });

  it.each(['0', '-1', 'abc'])(
    'goes Home with the book message for book id %s and requests nothing',
    async (bookId) => {
      renderWithRoutes('9', bookId);

      expect(await screen.findByText('/|REPLACE')).toBeInTheDocument();
      expect(
        await screen.findAllByText('This book no longer exists.')
      ).toHaveLength(1);
      expect(mocked.getChapter).not.toHaveBeenCalled();
      expect(mocked.listChapters).not.toHaveBeenCalled();
      expect(mockedBooks.getBook).not.toHaveBeenCalled();
    }
  );

  it.each(['x', '0', '-3', '1.5'])(
    'goes to the Book page with the chapter message for chapter id %s and requests no chapter',
    async (chapterId) => {
      renderWithRoutes(chapterId);

      expect(
        await screen.findAllByText('This chapter no longer exists.')
      ).toHaveLength(1);
      expect(mocked.getChapter).not.toHaveBeenCalled();
    }
  );

  it('keeps the Alert on a server error', async () => {
    mocked.getChapter.mockRejectedValue(new ApiError(500, 'boom'));
    renderWithRoutes('5');
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

const renderPagesAt = (chapterId: number, queryClient?: QueryClient) =>
  renderWithProviders(
    <>
      <ChapterPage />
      <LocationState />
    </>,
    {
      route: `/books/1/chapters/${chapterId}`,
      path: '/books/:bookId/chapters/:chapterId',
      preloadedState: inPages,
      queryClient,
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

describe('ChapterPage pages from the keyboard', () => {
  it('turns forward on the right arrow, Page Down and Space, back on the left arrow and Page Up', async () => {
    measure.countPages.mockReturnValue(5);
    renderPagesAt(10);
    await screen.findByText('Page 1 of 5');

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
    await userEvent.keyboard('{PageDown}');
    expect(screen.getByText('Page 3 of 5')).toBeInTheDocument();
    await userEvent.keyboard(' ');
    expect(screen.getByText('Page 4 of 5')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('Page 3 of 5')).toBeInTheDocument();
    await userEvent.keyboard('{PageUp}');
    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
  });

  it('hands off to the next chapter from the last page', async () => {
    renderPagesAt(10);
    await screen.findByText('Page 1 of 3');

    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');

    expect(
      await screen.findByRole('heading', { name: 'Three' })
    ).toBeInTheDocument();
  });

  it('ignores a key with a modifier held', async () => {
    renderPagesAt(10);
    await screen.findByText('Page 1 of 3');

    await userEvent.keyboard('{Control>}{ArrowRight}{/Control}');
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Two' })).toBeInTheDocument();
  });

  it('leaves the keys to a field being typed in', async () => {
    renderWithProviders(
      <>
        <input aria-label="Search" />
        <ChapterPage />
      </>,
      {
        route: '/books/1/chapters/10',
        path: '/books/:bookId/chapters/:chapterId',
        preloadedState: inPages,
      }
    );
    await screen.findByText('Page 1 of 3');
    const search = screen.getByRole('textbox', { name: 'Search' });

    await userEvent.click(search);
    await userEvent.keyboard('a b{ArrowLeft}{ArrowRight}{PageDown}');

    expect(search).toHaveValue('a b');
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('turns once when Space presses a focused arrow', async () => {
    renderPagesAt(10);
    await screen.findByText('Page 1 of 3');
    arrows('Next page')[0]!.focus();

    await userEvent.keyboard(' ');

    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('turns nothing while the contents are open', async () => {
    renderPagesAt(10);
    await screen.findByText('Page 1 of 3');
    await userEvent.click(screen.getByRole('button', { name: 'Contents' }));
    await screen.findByRole('navigation', { name: 'Chapters' });

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('turns nothing while the reading preferences are open', async () => {
    renderPagesAt(10);
    await screen.findByText('Page 1 of 3');
    await userEvent.click(
      screen.getByRole('button', { name: 'Reading preferences' })
    );
    await screen.findByText('Background');

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('leaves the keys alone in scroll', async () => {
    renderAt(10);
    await screen.findByRole('heading', { name: 'Two' });

    await userEvent.keyboard('{ArrowRight}{PageDown} ');

    expect(screen.getByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(screen.queryByText(/^Page /)).not.toBeInTheDocument();
  });
});

describe('ChapterPage pages from a click on the text', () => {
  // jsdom lays nothing out, so the window is given a 900px-wide box.
  const renderWithWindow = async () => {
    renderPagesAt(10);
    const heading = await screen.findByRole('heading', { name: 'Two' });
    const pageWindow = heading.parentElement!.parentElement!;
    jest.spyOn(pageWindow, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 900,
    } as DOMRect);
    return heading;
  };

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('turns forward on the right third and back on the left third', async () => {
    const heading = await renderWithWindow();

    fireEvent.click(heading, { clientX: 850 });
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    fireEvent.click(heading, { clientX: 50 });
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('does nothing on the middle third', async () => {
    const heading = await renderWithWindow();

    fireEvent.click(heading, { clientX: 450 });

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('does not turn at the end of a text selection', async () => {
    const heading = await renderWithWindow();
    const range = document.createRange();
    range.selectNodeContents(screen.getByText('It was a dark night.'));
    window.getSelection()?.addRange(range);

    fireEvent.click(heading, { clientX: 850 });

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });
});

describe('ChapterPage reading progress', () => {
  const progress = mockedLibrary.postReadingProgress;
  const strict = (chapterId: number) =>
    renderWithProviders(
      <StrictMode>
        <ChapterPage />
      </StrictMode>,
      {
        route: `/books/1/chapters/${chapterId}`,
        path: '/books/:bookId/chapters/:chapterId',
        queryClient: signedIn(reader),
      }
    );

  it('opens send one opened event with the chapter id', async () => {
    const view = strict(9);
    await waitFor(() =>
      expect(progress).toHaveBeenCalledWith(1, {
        event: 'opened',
        chapterId: 9,
      })
    );

    view.rerender(
      <StrictMode>
        <ChapterPage />
      </StrictMode>
    );
    await userEvent.click(
      screen.getAllByRole('link', { name: 'Next chapter: Two' })[0]!
    );
    await screen.findByRole('heading', { name: 'Two' });

    await waitFor(() =>
      expect(progress).toHaveBeenLastCalledWith(1, {
        event: 'opened',
        chapterId: 10,
      })
    );
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a Guest', undefined],
    ['a Co-author', coAuthor],
  ])('%s sends nothing', async (_name, user) => {
    const { store } = renderAt(9, user && signedIn(user));
    await screen.findByRole('heading', { name: 'One' });
    // The Book detail has loaded once the Book is recorded.
    await waitFor(() =>
      expect(store.getState().recentlyViewed.ids).toEqual([1])
    );

    sentinelComesIntoView();

    expect(progress).not.toHaveBeenCalled();
  });

  it('Scroll sends finished once when the sentinel intersects, not before', async () => {
    renderAt(9, signedIn(reader));
    await waitFor(() => expect(progress).toHaveBeenCalledTimes(1));

    expect(progress).not.toHaveBeenCalledWith(1, {
      event: 'finished',
      chapterId: 9,
    });

    sentinelComesIntoView();
    sentinelComesIntoView();

    await waitFor(() =>
      expect(progress).toHaveBeenLastCalledWith(1, {
        event: 'finished',
        chapterId: 9,
      })
    );
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it('Pages sends finished on the last page only', async () => {
    renderPagesAt(10, signedIn(reader));
    await screen.findByText('Page 1 of 3');
    await waitFor(() => expect(progress).toHaveBeenCalledTimes(1));

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(progress).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();

    await waitFor(() =>
      expect(progress).toHaveBeenLastCalledWith(1, {
        event: 'finished',
        chapterId: 10,
      })
    );
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it('a one-page chapter in Pages sends opened and finished', async () => {
    measure.countPages.mockReturnValue(1);
    renderPagesAt(9, signedIn(reader));

    await waitFor(() => expect(progress).toHaveBeenCalledTimes(2));
    expect(progress.mock.calls.map(([, payload]) => payload)).toEqual([
      { event: 'opened', chapterId: 9 },
      { event: 'finished', chapterId: 9 },
    ]);
  });
});

describe('ChapterPage illustrations', () => {
  const pictures = {
    items: [
      {
        id: 7,
        position: 1,
        caption: 'A map',
        updatedAt: '2026-10-17T10:00:00.000Z',
      },
      {
        id: 8,
        position: 2,
        caption: null,
        updatedAt: '2026-10-17T10:00:00.000Z',
      },
    ],
  };
  beforeEach(() =>
    mockedIllustrations.listIllustrations.mockResolvedValue(pictures)
  );

  it('scroll: shows them after the chapter text', async () => {
    renderAt(9);
    const text = await screen.findByText('It was a dark night.');
    const caption = await screen.findByText('A map');
    expect(mockedIllustrations.listIllustrations).toHaveBeenCalledWith(9);
    expect(
      text.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('scroll: a chapter without pictures shows none', async () => {
    mockedIllustrations.listIllustrations.mockResolvedValue({ items: [] });
    renderAt(9);
    await screen.findByText('It was a dark night.');
    expect(screen.queryByRole('region', { name: 'Illustrations' })).toBeNull();
  });

  it('pages: hidden on page 1 of 3, shown on the last page', async () => {
    renderPagesAt(10);
    await screen.findByText('Page 1 of 3');
    await waitFor(() =>
      expect(mockedIllustrations.listIllustrations).toHaveBeenCalled()
    );
    expect(screen.queryByText('A map')).toBeNull();

    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();
    expect(await screen.findByText('A map')).toBeInTheDocument();
  });

  it('pages: they are as wide as the text window', async () => {
    measure.countPages.mockReturnValue(1);
    renderPagesAt(9);
    const pageWindow = (await screen.findByRole('heading', { level: 2 }))
      .parentElement!.parentElement!;
    const section = await screen.findByRole('region', {
      name: 'Illustrations',
    });
    expect(pageWindow.style.width).not.toBe('');
    expect(section.parentElement!.style.width).toBe(pageWindow.style.width);
  });

  it('pages: a one-page chapter shows them at once', async () => {
    measure.countPages.mockReturnValue(1);
    renderPagesAt(9);
    expect(await screen.findByText('A map')).toBeInTheDocument();
  });
});
