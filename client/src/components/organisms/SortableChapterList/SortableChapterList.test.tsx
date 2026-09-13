import { screen } from '@testing-library/react';
import { SortableChapterList } from './SortableChapterList';
import { renderWithProviders } from '@/test/renderWithProviders';
import { layOutSortableRows, moveWithKeyboard } from '@/test/sortable';
import type { ChapterSummary } from '@/types/chapter';

const chapter: ChapterSummary = {
  id: 1,
  bookId: 7,
  title: 'One',
  publishedAt: '2026-09-03T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const items: ChapterSummary[] = [
  chapter,
  { ...chapter, id: 2, title: 'Two', publishedAt: null },
  {
    ...chapter,
    id: 3,
    title: 'Three',
    publishedAt: new Date(Date.now() + 86_400_000).toISOString(),
  },
];

const baseProps = {
  bookId: 7,
  items,
  isPending: false,
  isError: false,
  onReorder: jest.fn(),
};

describe('SortableChapterList', () => {
  let restoreLayout: () => void;
  beforeEach(() => {
    restoreLayout = layOutSortableRows();
  });
  afterEach(() => restoreLayout());

  it('lists every chapter in Reading order, linked to its editor, with no numbers', () => {
    renderWithProviders(<SortableChapterList {...baseProps} />);

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['One', 'Two', 'Three']
    );
    expect(screen.getByRole('link', { name: 'Two' })).toHaveAttribute(
      'href',
      '/books/7/chapters/2/edit'
    );
    expect(screen.queryByText(/^\d+\.?$/)).toBeNull();
  });

  it('badges the chapters that are not out yet', () => {
    renderWithProviders(<SortableChapterList {...baseProps} />);

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getAllByText(/^(Draft|Scheduled)$/)).toHaveLength(2);
  });

  it('gives every chapter a drag handle named after it', () => {
    renderWithProviders(<SortableChapterList {...baseProps} />);

    expect(
      screen
        .getAllByRole('button', { name: /^Reorder / })
        .map((handle) => handle.getAttribute('aria-label'))
    ).toEqual(['Reorder One', 'Reorder Two', 'Reorder Three']);
  });

  it('moves a chapter with the keyboard alone', async () => {
    const onReorder = jest.fn();
    renderWithProviders(
      <SortableChapterList {...baseProps} onReorder={onReorder} />
    );

    await moveWithKeyboard(
      screen.getByRole('button', { name: 'Reorder One' }),
      'ArrowDown'
    );

    expect(onReorder).toHaveBeenCalledWith([2, 1, 3]);
  });

  it('moves a chapter up as well as down', async () => {
    const onReorder = jest.fn();
    renderWithProviders(
      <SortableChapterList {...baseProps} onReorder={onReorder} />
    );

    await moveWithKeyboard(
      screen.getByRole('button', { name: 'Reorder Three' }),
      'ArrowUp',
      2
    );

    expect(onReorder).toHaveBeenCalledWith([3, 1, 2]);
  });

  it('saves nothing when a chapter is dropped where it was', async () => {
    const onReorder = jest.fn();
    renderWithProviders(
      <SortableChapterList {...baseProps} onReorder={onReorder} />
    );

    await moveWithKeyboard(
      screen.getByRole('button', { name: 'Reorder Two' }),
      'ArrowDown',
      0
    );

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('reports an empty book, a failure, and a load in flight', () => {
    const { rerender } = renderWithProviders(
      <SortableChapterList {...baseProps} items={[]} />
    );
    expect(screen.getByText('No chapters yet.')).toBeInTheDocument();

    rerender(<SortableChapterList {...baseProps} items={[]} isError />);
    expect(
      screen.getByText('Could not load the chapters.')
    ).toBeInTheDocument();

    rerender(<SortableChapterList {...baseProps} items={[]} isPending />);
    expect(screen.queryByText('No chapters yet.')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
