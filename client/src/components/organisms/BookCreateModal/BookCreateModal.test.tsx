import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookCreateModal } from './BookCreateModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as booksApi from '@/api/books';
import * as genresApi from '@/api/genres';
import * as seriesApi from '@/api/series';
import type { PublicBook } from '@/types/book';

jest.mock('@/api/books');
jest.mock('@/api/genres');
jest.mock('@/api/series');

const mockedBooks = jest.mocked(booksApi);
const mockedGenres = jest.mocked(genresApi);
const mockedSeries = jest.mocked(seriesApi);

const book = (
  id: number,
  title: string,
  status: PublicBook['status']
): PublicBook => ({
  id,
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
  title,
  description: `${title}, described`,
  tags: [],
  status,
  genre: null,
  coverUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const renderModal = ({ onClose }: { onClose: () => void }) =>
  renderWithProviders(<BookCreateModal authorId={3} onClose={onClose} />);

const type = async () => {
  await userEvent.type(screen.getByLabelText('Title'), 'A Tale of Dragons');
  await userEvent.type(screen.getByLabelText('Description'), 'Long ago.');
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedSeries.listSeries.mockResolvedValue({
    items: [],
    total: 0,
    limit: 100,
    offset: 0,
  });
  mockedGenres.listGenres.mockResolvedValue({ items: [] });
});

describe('BookCreateModal', () => {
  it('creates the book with explicit nulls, closes and announces it', async () => {
    mockedBooks.createBook.mockResolvedValue(
      book(9, 'A Tale of Dragons', 'draft')
    );
    const onClose = jest.fn();
    renderModal({ onClose });
    expect(
      screen.getByRole('dialog', { name: 'Create book' })
    ).toBeInTheDocument();

    await type();
    await userEvent.click(screen.getByRole('button', { name: 'Create book' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedBooks.createBook).toHaveBeenCalledWith({
      title: 'A Tale of Dragons',
      description: 'Long ago.',
      tags: [],
      seriesId: null,
      genreId: null,
    });
    expect(await screen.findByText('Book created.')).toBeInTheDocument();
  });

  it('stays open with the server message and the typed values on a refusal', async () => {
    mockedBooks.createBook.mockRejectedValue(new Error('Title is taken'));
    const onClose = jest.fn();
    renderModal({ onClose });

    await type();
    await userEvent.click(screen.getByRole('button', { name: 'Create book' }));

    expect(await screen.findByText('Title is taken')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title')).toHaveValue('A Tale of Dragons');
    expect(screen.queryByText('Book created.')).toBeNull();
  });

  it('asks before discarding typed input', async () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    await userEvent.type(screen.getByLabelText('Title'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect((await screen.findAllByText('Discard changes?')).length).not.toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still asks when the typed input was cleared back to empty', async () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    const title = screen.getByLabelText('Title');
    await userEvent.type(title, 'x');
    await userEvent.clear(title);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect((await screen.findAllByText('Discard changes?')).length).not.toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });
});
