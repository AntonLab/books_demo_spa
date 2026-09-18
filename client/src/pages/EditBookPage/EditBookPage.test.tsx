import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { EditBookPage } from './EditBookPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { formatDate } from '@/format/date';
import { layOutSortableRows, moveWithKeyboard } from '@/test/sortable';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as authorsApi from '@/api/authors';
import { ApiError } from '@/api/client';
import * as booksApi from '@/api/books';
import * as chaptersApi from '@/api/chapters';
import * as seriesApi from '@/api/series';
import type { BookDetail } from '@/types/book';
import type { PublicUser } from '@/types/user';

jest.mock('@/api/authors');
jest.mock('@/api/books');
jest.mock('@/api/chapters');
jest.mock('@/api/series');

const mockedAuthors = jest.mocked(authorsApi);
const mockedBooks = jest.mocked(booksApi);
const mockedChapters = jest.mocked(chaptersApi);
const mockedSeries = jest.mocked(seriesApi);

const ann = {
  id: 3,
  login: 'ann',
  firstName: 'Ann',
  lastName: 'Author',
  avatarUrl: null,
};
const cora = {
  id: 4,
  login: 'cora',
  firstName: 'Cora',
  lastName: 'Writer',
  avatarUrl: null,
};

const book: BookDetail = {
  id: 1,
  authors: [ann, cora],
  seriesId: null,
  title: 'A Tale of Dragons',
  description: 'Long ago.',
  tags: ['epic'],
  status: 'draft',
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  series: null,
  likeCount: 0,
  viewerLikeId: null,
};

const account = (overrides: Partial<PublicUser>): PublicUser => ({
  id: ann.id,
  login: 'ann',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Author',
  status: 'active',
  role: 'author',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const renderPage = (session: PublicUser | null = account({})) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);

  return renderWithProviders(
    <Routes>
      <Route path="/books/:id/edit" element={<EditBookPage />} />
      <Route path="/my-books" element={<p>My books list</p>} />
    </Routes>,
    { route: '/books/1/edit', queryClient }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedBooks.getBook.mockResolvedValue(book);
  mockedSeries.listSeries.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  });
  mockedAuthors.searchAuthors.mockResolvedValue([]);
  mockedChapters.listChapters.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  });
});

describe('EditBookPage', () => {
  it('loads the book and saves its fields and status', async () => {
    mockedBooks.updateBook.mockResolvedValue(book);
    renderPage();

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveValue('A Tale of Dragons');

    await userEvent.clear(title);
    await userEvent.type(title, 'Dragons, Revised');
    await userEvent.click(screen.getByText('In progress'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockedBooks.updateBook).toHaveBeenCalledWith(1, {
      title: 'Dragons, Revised',
      description: 'Long ago.',
      tags: ['epic'],
      seriesId: null,
      status: 'in_progress',
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('manages the co-authors from the same page', async () => {
    renderPage();

    expect(await screen.findByText('Cora Writer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
  });

  it('deletes the book only once the deletion is confirmed', async () => {
    mockedBooks.deleteBook.mockResolvedValue(undefined);
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete book' })
    );
    expect(mockedBooks.deleteBook).not.toHaveBeenCalled();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );

    await waitFor(() => expect(mockedBooks.deleteBook).toHaveBeenCalledWith(1));
    expect(await screen.findByText('My books list')).toBeInTheDocument();
  });

  it('leaving the book returns to My books', async () => {
    mockedBooks.removeCoAuthor.mockResolvedValue(book);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Yes, leave' })
    );

    expect(await screen.findByText('My books list')).toBeInTheDocument();
  });

  it('turns away an account that does not co-author the book', async () => {
    renderPage(account({ id: 99, login: 'reader', role: 'user' }));

    expect(
      await screen.findByText('Only its co-authors can edit this book.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
  });

  it('lets a moderator edit the book but not its byline', async () => {
    renderPage(account({ id: 99, login: 'admin', role: 'admin' }));

    expect(await screen.findByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByText('Cora Writer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
  });

  it('reports a book that will not load', async () => {
    mockedBooks.getBook.mockRejectedValue(new Error('nope'));
    renderPage();

    expect(
      await screen.findByText('Could not load this book.')
    ).toBeInTheDocument();
  });
});

describe('EditBookPage chapters', () => {
  it('lists every chapter with its state, and offers to add one', async () => {
    const chapter = {
      bookId: 1,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    mockedChapters.listChapters.mockResolvedValue({
      items: [
        {
          ...chapter,
          id: 9,
          title: 'Out',
          publishedAt: '2026-09-02T00:00:00.000Z',
        },
        { ...chapter, id: 10, title: 'Unwritten', publishedAt: null },
        {
          ...chapter,
          id: 11,
          title: 'Coming',
          publishedAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      ],
      total: 3,
      limit: 100,
      offset: 0,
    });
    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Unwritten' })
    ).toHaveAttribute('href', '/books/1/chapters/10/edit');
    expect(
      screen.getByText('Draft', { selector: '.ant-tag' })
    ).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(
      screen.getByText(formatDate('2026-09-02T00:00:00.000Z'))
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add chapter' })).toHaveAttribute(
      'href',
      '/books/1/chapters/new'
    );
  });

  it('offers no new chapter to a moderator, who may not create one', async () => {
    renderPage(account({ id: 99, login: 'admin', role: 'admin' }));

    await screen.findByLabelText('Title');
    expect(screen.queryByRole('link', { name: 'Add chapter' })).toBeNull();
  });
});

describe('EditBookPage Reading order', () => {
  const chapterNamed = (id: number, title: string) => ({
    id,
    bookId: 1,
    title,
    publishedAt: '2026-09-02T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  });
  const page = (items: ReturnType<typeof chapterNamed>[]) => ({
    items,
    total: items.length,
    limit: 100,
    offset: 0,
  });
  const one = chapterNamed(1, 'One');
  const two = chapterNamed(2, 'Two');
  const three = chapterNamed(3, 'Three');

  const titlesOnScreen = () =>
    screen
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((text) => ['One', 'Two', 'Three', 'Four'].includes(text ?? ''));

  let restoreLayout: () => void;
  beforeEach(() => {
    restoreLayout = layOutSortableRows();
  });
  afterEach(() => restoreLayout());

  it('shows the new order at once and saves it on drop', async () => {
    let finishSave: () => void = () => {};
    mockedChapters.reorderChapters.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSave = resolve;
      })
    );
    mockedChapters.listChapters
      .mockResolvedValueOnce(page([one, two, three]))
      .mockResolvedValue(page([two, one, three]));
    renderPage();

    await moveWithKeyboard(
      await screen.findByRole('button', { name: 'Reorder One' }),
      'ArrowDown'
    );

    expect(mockedChapters.reorderChapters).toHaveBeenCalledWith(1, [2, 1, 3]);
    expect(titlesOnScreen()).toEqual(['Two', 'One', 'Three']);

    finishSave();
    await waitFor(() =>
      expect(mockedChapters.listChapters).toHaveBeenCalledTimes(2)
    );
    expect(titlesOnScreen()).toEqual(['Two', 'One', 'Three']);
  });

  it('puts the old order back when the save fails', async () => {
    let failSave: (error: Error) => void = () => {};
    mockedChapters.reorderChapters.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        failSave = reject;
      })
    );
    // The list the server would still answer with, so the refetch after the
    // failure cannot be what restores the order.
    mockedChapters.listChapters
      .mockResolvedValueOnce(page([one, two, three]))
      .mockReturnValue(new Promise(() => {}));
    renderPage();

    await moveWithKeyboard(
      await screen.findByRole('button', { name: 'Reorder One' }),
      'ArrowDown'
    );
    expect(titlesOnScreen()).toEqual(['Two', 'One', 'Three']);

    failSave(new ApiError(500, 'Internal Server Error'));

    expect(
      await screen.findByText('Could not save the new chapter order.')
    ).toBeInTheDocument();
    expect(titlesOnScreen()).toEqual(['One', 'Two', 'Three']);
  });

  it('on a conflict reloads the chapters and says why the order changed', async () => {
    mockedChapters.reorderChapters.mockRejectedValue(
      new ApiError(
        409,
        'The chapters of this book changed since you loaded them'
      )
    );
    mockedChapters.listChapters
      .mockResolvedValueOnce(page([one, two, three]))
      .mockResolvedValue(page([one, two, three, chapterNamed(4, 'Four')]));
    renderPage();

    await moveWithKeyboard(
      await screen.findByRole('button', { name: 'Reorder Three' }),
      'ArrowUp'
    );

    expect(
      await screen.findByText(
        'A co-author changed the chapters while you were reordering them. This is their current order.'
      )
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(titlesOnScreen()).toEqual(['One', 'Two', 'Three', 'Four'])
    );
  });
});

describe('EditBookPage, the Cover block', () => {
  const fileInput = () =>
    document.querySelector('input[type="file"]') as HTMLInputElement;

  it('shows the current cover, or the title placeholder when there is none', async () => {
    renderPage();

    expect(await screen.findByText('A Tale of Dragons')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upload cover' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove cover' })).toBeNull();
  });

  it('offers Remove behind a confirm once the book has a cover', async () => {
    mockedBooks.getBook.mockResolvedValue({
      ...book,
      coverUrl: '/api/books/1/cover?v=1',
    });
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Remove cover' })
    ).toBeInTheDocument();
  });

  it('uploads the picked file', async () => {
    mockedBooks.uploadBookCover.mockResolvedValue({
      ...book,
      coverUrl: '/api/books/1/cover?v=2',
    });
    renderPage();
    await screen.findByLabelText('Title');
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', {
      type: 'image/png',
    });

    await userEvent.upload(fileInput(), file);

    await waitFor(() =>
      expect(mockedBooks.uploadBookCover).toHaveBeenCalledWith(1, file)
    );
  });

  it('rejects an unaccepted file type before calling the API', async () => {
    // user-event v14 applies the input's `accept` attribute by default, which
    // would silently drop the .gif before it ever reached the precheck.
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await screen.findByLabelText('Title');
    const file = new File([new Uint8Array([1])], 'cover.gif', {
      type: 'image/gif',
    });

    await user.upload(fileInput(), file);

    expect(mockedBooks.uploadBookCover).not.toHaveBeenCalled();
    expect(
      screen.getByText('Choose a JPEG, PNG or WebP image.')
    ).toBeInTheDocument();
  });

  it('shows the server error on a failed upload', async () => {
    mockedBooks.uploadBookCover.mockRejectedValue(
      new Error('Not a valid image')
    );
    renderPage();
    await screen.findByLabelText('Title');
    const file = new File([new Uint8Array([1])], 'cover.png', {
      type: 'image/png',
    });

    await userEvent.upload(fileInput(), file);

    expect(await screen.findByText('Not a valid image')).toBeInTheDocument();
  });

  it('removes the cover on confirm', async () => {
    mockedBooks.deleteBookCover.mockResolvedValue(undefined);
    mockedBooks.getBook.mockResolvedValue({
      ...book,
      coverUrl: '/api/books/1/cover?v=1',
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove cover' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    expect(mockedBooks.deleteBookCover).toHaveBeenCalledWith(1);
  });

  it('shows the server error on a failed remove', async () => {
    mockedBooks.deleteBookCover.mockRejectedValue(
      new Error('Could not remove the cover')
    );
    mockedBooks.getBook.mockResolvedValue({
      ...book,
      coverUrl: '/api/books/1/cover?v=1',
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove cover' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    expect(
      await screen.findByText('Could not remove the cover')
    ).toBeInTheDocument();
  });

  it('clears a previous rejection message once a new, accepted file is picked', async () => {
    mockedBooks.uploadBookCover.mockResolvedValue({
      ...book,
      coverUrl: '/api/books/1/cover?v=2',
    });
    renderPage();
    await screen.findByLabelText('Title');
    const bad = new File([new Uint8Array([1])], 'cover.gif', {
      type: 'image/gif',
    });
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(fileInput(), bad);
    expect(
      await screen.findByText('Choose a JPEG, PNG or WebP image.')
    ).toBeInTheDocument();

    const good = new File([new Uint8Array([1, 2, 3])], 'cover.png', {
      type: 'image/png',
    });
    await user.upload(fileInput(), good);

    expect(screen.queryByText('Choose a JPEG, PNG or WebP image.')).toBeNull();
  });
});
