import { screen } from '@testing-library/react';
import { BookStatistics } from './BookStatistics';
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
  book: { likeCount: 4, commentCount: 7, wordCount: 12345 },
  chapters: [chapter],
  isPending: false,
  isError: false,
};

// antd's non-bordered Descriptions renders each item as a label span followed
// by its content span.
const valueOf = (label: string) =>
  screen.getByText(label).nextElementSibling?.textContent;

describe('BookStatistics', () => {
  it('lists the six figures in order', () => {
    renderWithProviders(<BookStatistics {...baseProps} />);

    expect(
      [
        'Chapters',
        'Words',
        'Likes',
        'Comments',
        'Release time',
        'Last update',
      ].map((label) => [label, valueOf(label)])
    ).toEqual([
      ['Chapters', '1'],
      ['Words', '12,345'],
      ['Likes', '4'],
      ['Comments', '7'],
      ['Release time', formatDate('2026-09-03T00:00:00.000Z')],
      ['Last update', formatDate('2026-09-03T00:00:00.000Z')],
    ]);
    // Label order on the page, not only presence.
    const labels = Array.from(
      document.querySelectorAll('.ant-descriptions-item-label'),
      (label) => label.textContent
    );
    expect(labels).toEqual([
      'Chapters',
      'Words',
      'Likes',
      'Comments',
      'Release time',
      'Last update',
    ]);
  });

  it('dates the release and the last update by Publication time, not by Reading order', () => {
    // A chapter moved to the front after the others came out: first in the
    // list, latest to be published.
    renderWithProviders(
      <BookStatistics
        {...baseProps}
        chapters={[
          { ...chapter, id: 12, publishedAt: '2026-09-20T00:00:00.000Z' },
          { ...chapter, id: 13, publishedAt: '2026-09-01T00:00:00.000Z' },
          chapter,
        ]}
      />
    );

    expect(valueOf('Chapters')).toBe('3');
    expect(valueOf('Release time')).toBe(
      formatDate('2026-09-01T00:00:00.000Z')
    );
    expect(valueOf('Last update')).toBe(formatDate('2026-09-20T00:00:00.000Z'));
  });

  it('shows a dash for both dates, and zeros, on a book with nothing out', () => {
    renderWithProviders(
      <BookStatistics
        {...baseProps}
        book={{ likeCount: 0, commentCount: 0, wordCount: 0 }}
        chapters={[]}
      />
    );

    expect(valueOf('Chapters')).toBe('0');
    expect(valueOf('Words')).toBe('0');
    expect(valueOf('Likes')).toBe('0');
    expect(valueOf('Comments')).toBe('0');
    expect(valueOf('Release time')).toBe('—');
    expect(valueOf('Last update')).toBe('—');
  });

  it('holds the chapter figures back while the chapters load', () => {
    renderWithProviders(
      <BookStatistics {...baseProps} chapters={[]} isPending />
    );

    // Not "0" and not "—": neither is known yet.
    expect(valueOf('Chapters')).toBe('');
    expect(valueOf('Release time')).toBe('');
    expect(valueOf('Last update')).toBe('');
    // The book's own figures have loaded.
    expect(valueOf('Words')).toBe('12,345');
    expect(valueOf('Likes')).toBe('4');
    expect(valueOf('Comments')).toBe('7');
  });

  it('reports the chapter figures as unavailable when the chapters fail', () => {
    renderWithProviders(
      <BookStatistics {...baseProps} chapters={[]} isError />
    );

    expect(valueOf('Chapters')).toBe('Could not load');
    expect(valueOf('Release time')).toBe('Could not load');
    expect(valueOf('Last update')).toBe('Could not load');
    expect(valueOf('Words')).toBe('12,345');
    expect(valueOf('Comments')).toBe('7');
  });
});
