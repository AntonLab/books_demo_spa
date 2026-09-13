import { screen } from '@testing-library/react';
import { ChapterPage } from './ChapterPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as chaptersApi from '@/api/chapters';
import type { ChapterSummary } from '@/types/chapter';

jest.mock('@/api/chapters');

const mocked = jest.mocked(chaptersApi);

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

  it('links back to the book', async () => {
    renderAt(9);

    expect(
      await screen.findByRole('link', { name: 'Back to the book' })
    ).toHaveAttribute('href', '/books/1');
  });

  it('offers Next but not Previous on the first chapter', async () => {
    renderAt(9);

    expect(await screen.findByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/books/1/chapters/10'
    );
    expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull();
  });

  it('offers both around a middle chapter', async () => {
    renderAt(10);

    expect(
      await screen.findByRole('link', { name: 'Previous' })
    ).toHaveAttribute('href', '/books/1/chapters/9');
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/books/1/chapters/11'
    );
  });

  it('offers Previous but not Next on the last chapter', async () => {
    renderAt(11);

    expect(
      await screen.findByRole('link', { name: 'Previous' })
    ).toHaveAttribute('href', '/books/1/chapters/10');
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
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

    expect(await screen.findByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/books/1/chapters/11'
    );
  });
});
