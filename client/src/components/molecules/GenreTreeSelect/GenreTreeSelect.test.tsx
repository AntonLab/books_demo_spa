import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';
import type { GenreListItem } from 'shared';
import { GenreTreeSelect } from './GenreTreeSelect';
import { renderWithProviders } from '@/test/renderWithProviders';
import { genreItem } from '@/test/genres';

const GENRES = [
  genreItem(1, 'Fantasy'),
  genreItem(2, 'Urban Fantasy', 1),
  genreItem(3, 'Horror'),
];

const user = userEvent.setup();

const renderHarness = ({
  initial,
  onChange,
  genres = GENRES,
}: {
  initial?: number;
  onChange?: (value: number | undefined) => void;
  genres?: GenreListItem[];
}) =>
  renderWithProviders(
    <Form
      initialValues={{ genre: initial }}
      onValuesChange={(changed: { genre?: number }) =>
        onChange?.(changed.genre)
      }
    >
      <Form.Item name="genre">
        <GenreTreeSelect aria-label="Genre" genres={genres} />
      </Form.Item>
    </Form>
  );

describe('GenreTreeSelect', () => {
  it('shows the chosen Subgenre as its full path', async () => {
    renderHarness({ initial: 2 });
    expect(
      await screen.findByTitle('Fantasy / Urban Fantasy')
    ).toBeInTheDocument();
  });

  it('lets the reader pick a top-level Genre that has Subgenres', async () => {
    const onChange = jest.fn();
    renderHarness({ onChange });
    await user.click(screen.getByRole('combobox', { name: 'Genre' }));
    await user.click(await screen.findByText('Fantasy'));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('lists Subgenres under their parent, expanded', async () => {
    renderHarness({});
    await user.click(screen.getByRole('combobox', { name: 'Genre' }));
    expect(await screen.findByText('Urban Fantasy')).toBeInTheDocument();
  });

  it('clears on Delete when closed and keeps the value while open', async () => {
    const onChange = jest.fn();
    renderHarness({ initial: 3, onChange });
    const box = screen.getByRole('combobox', { name: 'Genre' });
    await user.click(box);
    await user.keyboard('{Delete}');
    expect(onChange).not.toHaveBeenCalledWith(undefined);
    // rc-tree-select reads `which`, which user-event does not set.
    fireEvent.keyDown(box, { key: 'Escape', which: 27, keyCode: 27 });
    // rc-select closes on a macrotask, not inside the keydown.
    await waitFor(() => expect(box).toHaveAttribute('aria-expanded', 'false'));
    await user.keyboard('{Delete}');
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('shows an orphan Subgenre at the top level, not hidden', async () => {
    renderHarness({ genres: [genreItem(9, 'Lost', 99)] });
    await user.click(screen.getByRole('combobox', { name: 'Genre' }));
    expect(await screen.findByText('Lost')).toBeInTheDocument();
  });
});
