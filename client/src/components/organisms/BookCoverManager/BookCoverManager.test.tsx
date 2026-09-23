import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookCoverManager } from './BookCoverManager';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import type { PublicBook } from '@/types/book';

jest.mock('@/api/books');

const mockedBooks = jest.mocked(booksApi);

const book: PublicBook = {
  id: 1,
  authors: [],
  seriesId: null,
  title: 'A Tale of Dragons',
  description: 'Long ago.',
  tags: [],
  status: 'draft',
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

// antd's Upload hides its real input; the page tests reach for it the same way.
const fileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;

const renderManager = (coverUrl: string | null = null) =>
  renderWithProviders(
    <BookCoverManager
      bookId={1}
      coverUrl={coverUrl}
      title="A Tale of Dragons"
    />
  );

beforeEach(() => {
  jest.resetAllMocks();
});

describe('BookCoverManager', () => {
  it('offers only an upload while the book has no cover', () => {
    renderManager();

    expect(screen.getByText('Cover')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upload cover' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove cover' })).toBeNull();
  });

  it('offers Remove once there is a cover to remove', () => {
    renderManager('/api/books/1/cover?v=1');

    expect(
      screen.getByRole('button', { name: 'Remove cover' })
    ).toBeInTheDocument();
  });

  it('uploads the picked file', async () => {
    mockedBooks.uploadBookCover.mockResolvedValue({
      ...book,
      coverUrl: '/api/books/1/cover?v=2',
    });
    renderManager();
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', {
      type: 'image/png',
    });

    await userEvent.upload(fileInput(), file);

    await waitFor(() =>
      expect(mockedBooks.uploadBookCover).toHaveBeenCalledWith(1, file)
    );
  });

  it('explains a rejected file without calling the API, and clears that once a good one is picked', async () => {
    // user-event v14 applies the input's `accept` attribute by default, which
    // would drop the .gif before it ever reached the precheck.
    const user = userEvent.setup({ applyAccept: false });
    mockedBooks.uploadBookCover.mockResolvedValue(book);
    renderManager();

    await user.upload(
      fileInput(),
      new File([new Uint8Array([1])], 'cover.gif', { type: 'image/gif' })
    );

    expect(mockedBooks.uploadBookCover).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Choose a JPEG, PNG or WebP image.')
    ).toBeInTheDocument();

    await user.upload(
      fileInput(),
      new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' })
    );

    expect(screen.queryByText('Choose a JPEG, PNG or WebP image.')).toBeNull();
  });

  it('shows the server error when an upload fails', async () => {
    mockedBooks.uploadBookCover.mockRejectedValue(
      new Error('Not a valid image')
    );
    renderManager();

    await userEvent.upload(
      fileInput(),
      new File([new Uint8Array([1])], 'cover.png', { type: 'image/png' })
    );

    expect(await screen.findByText('Not a valid image')).toBeInTheDocument();
  });

  it('removes the cover only once the removal is confirmed', async () => {
    mockedBooks.deleteBookCover.mockResolvedValue(undefined);
    renderManager('/api/books/1/cover?v=1');

    await userEvent.click(screen.getByRole('button', { name: 'Remove cover' }));
    expect(mockedBooks.deleteBookCover).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    await waitFor(() =>
      expect(mockedBooks.deleteBookCover).toHaveBeenCalledWith(1)
    );
  });

  it('shows the server error when a removal fails', async () => {
    mockedBooks.deleteBookCover.mockRejectedValue(
      new Error('Could not remove the cover')
    );
    renderManager('/api/books/1/cover?v=1');

    await userEvent.click(screen.getByRole('button', { name: 'Remove cover' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    expect(
      await screen.findByText('Could not remove the cover')
    ).toBeInTheDocument();
  });
});
