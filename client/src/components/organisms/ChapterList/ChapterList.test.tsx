import { screen } from '@testing-library/react';
import { ChapterList } from './ChapterList';
import { renderWithProviders } from '@/test/renderWithProviders';
import { formatDate } from '@/format/date';
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
      screen.getByText(formatDate('2026-09-03T00:00:00.000Z'))
    ).toBeInTheDocument();
    expect(
      screen.queryByText(formatDate('2026-09-01T00:00:00.000Z'))
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

describe('ChapterList numbering', () => {
  // The number sits beside the link, not in it: the link's name stays the
  // title, so the row reads "2. Chapter One".
  const rows = () =>
    screen.getAllByRole('link').map((link) => link.parentElement?.textContent);

  it('numbers each chapter by its place in the list, from 1', () => {
    renderWithProviders(
      <ChapterList
        {...baseProps}
        items={[
          { ...chapter, id: 12, title: 'Written last, read first' },
          chapter,
          { ...chapter, id: 15, title: 'The End' },
        ]}
      />
    );

    expect(rows()).toEqual([
      '1. Written last, read first',
      '2. Chapter One',
      '3. The End',
    ]);
  });

  it('keeps a number the title carries of its own', () => {
    // The place wins: a title numbered by its author is shown as written.
    renderWithProviders(
      <ChapterList
        {...baseProps}
        items={[{ ...chapter, title: 'Chapter 3: The Gate' }]}
      />
    );

    expect(rows()).toEqual(['1. Chapter 3: The Gate']);
    expect(
      screen.getByRole('link', { name: 'Chapter 3: The Gate' })
    ).toHaveAttribute('href', '/books/1/chapters/9');
  });
});
