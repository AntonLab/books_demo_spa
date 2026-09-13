import { screen } from '@testing-library/react';
import { ChapterList } from './ChapterList';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { ChapterSummary } from '@/types/chapter';

const chapter: ChapterSummary = {
  id: 9,
  bookId: 1,
  title: 'Chapter One',
  publishedAt: '2026-09-03T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const baseProps = {
  bookId: 1,
  items: [chapter],
  isPending: false,
  isError: false,
};

describe('ChapterList', () => {
  it('links each chapter to the reader', () => {
    renderWithProviders(<ChapterList {...baseProps} />);

    expect(screen.getByRole('link', { name: 'Chapter One' })).toHaveAttribute(
      'href',
      '/books/1/chapters/9'
    );
  });

  it('reports an empty book', () => {
    renderWithProviders(<ChapterList {...baseProps} items={[]} />);

    expect(screen.getByText('No chapters yet.')).toBeInTheDocument();
  });

  it('reports a failure', () => {
    renderWithProviders(<ChapterList {...baseProps} items={[]} isError />);

    expect(
      screen.getByText('Could not load the chapters.')
    ).toBeInTheDocument();
  });

  it('shows no links while pending', () => {
    renderWithProviders(<ChapterList {...baseProps} items={[]} isPending />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('No chapters yet.')).toBeNull();
  });
});

describe('ChapterList dates and states', () => {
  it('dates a chapter by when it came out, not when it was written', () => {
    renderWithProviders(<ChapterList {...baseProps} />);

    expect(
      screen.getByText(
        new Date('2026-09-03T00:00:00.000Z').toLocaleDateString()
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        new Date('2026-09-01T00:00:00.000Z').toLocaleDateString()
      )
    ).toBeNull();
  });

  it('in edit mode links to the editor and badges what is not out yet', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    renderWithProviders(
      <ChapterList
        {...baseProps}
        editable
        items={[
          chapter,
          { ...chapter, id: 10, title: 'Unwritten', publishedAt: null },
          { ...chapter, id: 11, title: 'Coming', publishedAt: tomorrow },
        ]}
      />
    );

    expect(screen.getByRole('link', { name: 'Chapter One' })).toHaveAttribute(
      'href',
      '/books/1/chapters/9/edit'
    );
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getAllByText(/Draft|Scheduled/)).toHaveLength(2);
  });
});
