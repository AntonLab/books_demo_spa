import { screen } from '@testing-library/react';
import { SortableList, type SortableListItem } from './SortableList';
import { renderWithProviders } from '@/test/renderWithProviders';
import { layOutSortableRows, moveWithKeyboard } from '@/test/sortable';

const item = (id: number, label: string): SortableListItem => ({
  id,
  label,
  content: <a href={`/items/${id}`}>{label}</a>,
});

const baseProps = {
  items: [item(1, 'One'), item(2, 'Two'), item(3, 'Three')],
  isPending: false,
  isError: false,
  errorText: 'Could not load the items.',
  emptyText: 'Nothing here yet.',
  onReorder: jest.fn(),
};

describe('SortableList', () => {
  let restoreLayout: () => void;
  beforeEach(() => {
    restoreLayout = layOutSortableRows();
  });
  afterEach(() => restoreLayout());

  it('renders every row in the order given, with no numbers', () => {
    renderWithProviders(<SortableList {...baseProps} />);

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['One', 'Two', 'Three']
    );
    expect(screen.queryByText(/^\d+\.?$/)).toBeNull();
  });

  it('gives every row a drag handle named after it', () => {
    renderWithProviders(<SortableList {...baseProps} />);

    expect(
      screen
        .getAllByRole('button', { name: /^Reorder / })
        .map((handle) => handle.getAttribute('aria-label'))
    ).toEqual(['Reorder One', 'Reorder Two', 'Reorder Three']);
  });

  it('moves a row with the keyboard alone', async () => {
    const onReorder = jest.fn();
    renderWithProviders(<SortableList {...baseProps} onReorder={onReorder} />);

    await moveWithKeyboard(
      screen.getByRole('button', { name: 'Reorder One' }),
      'ArrowDown'
    );

    expect(onReorder).toHaveBeenCalledWith([2, 1, 3]);
  });

  it('moves a row up as well as down', async () => {
    const onReorder = jest.fn();
    renderWithProviders(<SortableList {...baseProps} onReorder={onReorder} />);

    await moveWithKeyboard(
      screen.getByRole('button', { name: 'Reorder Three' }),
      'ArrowUp',
      2
    );

    expect(onReorder).toHaveBeenCalledWith([3, 1, 2]);
  });

  it('saves nothing when a row is dropped where it was', async () => {
    const onReorder = jest.fn();
    renderWithProviders(<SortableList {...baseProps} onReorder={onReorder} />);

    await moveWithKeyboard(
      screen.getByRole('button', { name: 'Reorder Two' }),
      'ArrowDown',
      0
    );

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('reports an empty list, a failure, and a load in flight', () => {
    const { rerender } = renderWithProviders(
      <SortableList {...baseProps} items={[]} />
    );
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();

    rerender(<SortableList {...baseProps} items={[]} isError />);
    expect(screen.getByText('Could not load the items.')).toBeInTheDocument();

    rerender(<SortableList {...baseProps} items={[]} isPending />);
    expect(screen.queryByText('Nothing here yet.')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
