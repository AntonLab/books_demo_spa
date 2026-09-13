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

  it('lists the chapters in the order it is given, the Reading order', () => {
    renderWithProviders(
      <ChapterList
        {...baseProps}
        items={[
          { ...chapter, id: 12, title: 'Written last, read first' },
          chapter,
        ]}
      />
    );

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['Written last, read first', 'Chapter One']
    );
  });
});
