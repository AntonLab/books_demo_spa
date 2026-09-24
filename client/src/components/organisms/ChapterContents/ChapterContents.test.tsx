import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChapterContents } from './ChapterContents';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { BookDetail } from '@/types/book';
import type { ChapterSummary } from '@/types/chapter';

const summary = (id: number, title: string): ChapterSummary => ({
  id,
  bookId: 1,
  title,
  publishedAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const book: BookDetail = {
  id: 1,
  authors: [
    {
      id: 5,
      login: 'ada',
      firstName: 'Ada',
      lastName: 'Byron',
      avatarUrl: null,
    },
  ],
  seriesId: null,
  title: 'The Long Night',
  description: 'A book.',
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

const renderOpen = (onClose = jest.fn()) =>
  renderWithProviders(
    <ChapterContents
      book={book}
      chapters={[summary(9, 'One'), summary(10, 'Two')]}
      currentId={10}
      open
      onClose={onClose}
    />
  );

describe('ChapterContents', () => {
  it("shows the book's card", () => {
    renderOpen();

    expect(
      screen.getByRole('link', { name: 'The Long Night' })
    ).toHaveAttribute('href', '/books/1');
  });

  it('lists the chapters and marks the one being read', () => {
    renderOpen();

    expect(screen.getByRole('link', { name: 'One' })).toHaveAttribute(
      'href',
      '/books/1/chapters/9'
    );
    expect(screen.getByRole('link', { name: 'Two' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'One' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('closes once a chapter is picked', async () => {
    const onClose = jest.fn();
    renderOpen(onClose);

    await userEvent.click(screen.getByRole('link', { name: 'One' }));

    expect(onClose).toHaveBeenCalled();
  });
});
