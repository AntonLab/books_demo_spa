import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GenreManager } from './GenreManager';
import { renderWithProviders } from '@/test/renderWithProviders';
import { adminGenre, publicGenre } from '@/test/genres';
import { ApiError } from '@/api/client';
import * as genresApi from '@/api/genres';

jest.mock('@/api/genres');

const mockedGenres = jest.mocked(genresApi);

const renderManager = () =>
  renderWithProviders(<GenreManager />, { route: '/admin/genres' });

const renderLoaded = async () => {
  const view = renderManager();
  await screen.findByText('Mystery');
  return view;
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenreCounts.mockResolvedValue({
    items: [
      adminGenre(1, 'Fantasy'),
      adminGenre(2, 'Urban Fantasy', 1, 3, 1),
      adminGenre(7, 'Epic', 1),
      adminGenre(5, 'Mystery'),
      adminGenre(6, 'Romance', null, 0, 4),
    ],
  });
});

describe('GenreManager', () => {
  it('opens the edit form when Enter is pressed on a focused action button', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    act(() => screen.getByRole('button', { name: 'Edit Mystery' }).focus());
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows each Genre with its counts, a parent with totals', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(
      document.querySelector<HTMLElement>('.ant-tree-switcher')!
    );

    expect(await screen.findByText('Urban Fantasy')).toBeInTheDocument();
    expect(screen.getAllByText('3 books, 1 series')).toHaveLength(2);
    expect(screen.getByText('Mystery')).toBeInTheDocument();
    expect(screen.getAllByText('No works')).toHaveLength(2);
  });

  it('filters by the search box and shows the empty state', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.type(
      screen.getByRole('textbox', { name: 'Search genres' }),
      'zzz'
    );

    expect(await screen.findByText('No genres match.')).toBeInTheDocument();
  });

  it('expands matching parents while a query is typed', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.type(
      screen.getByRole('textbox', { name: 'Search genres' }),
      'urban'
    );

    expect(await screen.findByText('Urban Fantasy')).toBeInTheDocument();
    expect(screen.queryByText('Epic')).toBeNull();
  });

  it('filters by usage through the select', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('combobox', { name: 'Filter genres' }));
    await user.click(await screen.findByTitle('Has series'));

    await waitFor(() => expect(screen.queryByText('Mystery')).toBeNull());
    expect(screen.getByText('Romance')).toBeInTheDocument();
    expect(screen.getByText('Fantasy')).toBeInTheDocument();
  });

  it('opens the create form from the toolbar and from a top-level row', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.click(
      document.querySelector<HTMLElement>('.ant-tree-switcher')!
    );
    await screen.findByText('Urban Fantasy');

    expect(
      screen.queryByRole('button', { name: 'Add subgenre to Urban Fantasy' })
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add genre' }));
    // The Select on the page and the one in the dialog share antd's test id,
    // so the dialog's accessible name does not resolve: match its title text.
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Add genre')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(
      screen.getByRole('button', { name: 'Add subgenre to Fantasy' })
    );
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Add subgenre')).toBeInTheDocument();
    expect(within(dialog).getByText('Fantasy')).toBeInTheDocument();
  });

  it('opens the edit form with the Genre filled', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Edit Mystery' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit genre')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('textbox', { name: 'Genre name' })
    ).toHaveValue('Mystery');
  });

  it('deletes after the confirm', async () => {
    mockedGenres.deleteGenre.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Delete Mystery' }));
    await user.click(
      await screen.findByRole('button', { name: 'Yes, delete' })
    );

    await waitFor(() =>
      expect(mockedGenres.deleteGenre).toHaveBeenCalledWith(5)
    );
  });

  it('disables Delete for a Genre with Subgenres', async () => {
    await renderLoaded();

    expect(
      screen.getByRole('button', {
        name: 'Cannot delete Fantasy: it has subgenres',
      })
    ).toBeDisabled();
  });

  it('shows a delete error in an Alert and keeps the row', async () => {
    mockedGenres.deleteGenre.mockRejectedValue(new ApiError(409, 'In use'));
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Delete Mystery' }));
    await user.click(
      await screen.findByRole('button', { name: 'Yes, delete' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('In use');
    expect(screen.getByText('Mystery')).toBeInTheDocument();
  });

  it('drops a stale delete error when a form opens or the filter changes', async () => {
    mockedGenres.deleteGenre.mockRejectedValue(new ApiError(409, 'In use'));
    const user = userEvent.setup();
    await renderLoaded();

    const failDelete = async () => {
      await user.click(screen.getByRole('button', { name: 'Delete Mystery' }));
      await user.click(
        await screen.findByRole('button', { name: 'Yes, delete' })
      );
      expect(await screen.findByRole('alert')).toHaveTextContent('In use');
    };

    await failDelete();
    await user.click(screen.getByRole('button', { name: 'Add genre' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await failDelete();
    await user.type(
      screen.getByRole('textbox', { name: 'Search genres' }),
      'm'
    );
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  describe('dragging a Genre', () => {
    const rowOf = (name: string) =>
      screen.getByText(name).closest<HTMLElement>('.ant-tree-treenode')!;

    // Drops the row `from` on the middle of the row `onto`. jsdom has no
    // layout, so the target's geometry is stubbed for rc-tree's position maths.
    const drag = (from: string, onto: string) => {
      const source = rowOf(from);
      const target = rowOf(onto);
      const dataTransfer = { setData: jest.fn(), dropEffect: '' };
      jest.spyOn(target, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        height: 100,
        left: 0,
        width: 100,
        bottom: 100,
        right: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      fireEvent.dragStart(source, { dataTransfer });
      fireEvent.dragEnter(target, { dataTransfer, clientX: 0, clientY: 50 });
      fireEvent.dragOver(target, { dataTransfer, clientX: 0, clientY: 50 });
      fireEvent.drop(target, { dataTransfer, clientX: 0, clientY: 50 });
    };

    it('moves a Genre when it is dropped inside another', async () => {
      mockedGenres.updateGenre.mockResolvedValue(
        publicGenre(5, 'Mystery', { id: 1, name: 'Fantasy' })
      );
      await renderLoaded();

      drag('Mystery', 'Fantasy');

      await waitFor(() =>
        expect(mockedGenres.updateGenre).toHaveBeenCalledWith(5, {
          parentId: 1,
        })
      );
    });

    it('sends nothing for a refused drop', async () => {
      await renderLoaded();

      drag('Fantasy', 'Mystery');

      expect(mockedGenres.updateGenre).not.toHaveBeenCalled();
    });

    it('shows the server message on a 409 and leaves the tree as it was', async () => {
      mockedGenres.updateGenre.mockRejectedValue(
        new ApiError(409, 'A genre with this name already exists here')
      );
      await renderLoaded();

      drag('Mystery', 'Fantasy');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'A genre with this name already exists here'
      );
      expect(
        rowOf('Mystery').querySelector('.ant-tree-indent-unit')
      ).toBeNull();
    });
  });

  it('reports a failure to load the list', async () => {
    mockedGenres.listGenreCounts.mockRejectedValue(new Error('Network down'));
    renderManager();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the genres.'
    );
  });

  it('shows an empty state when there are no genres yet', async () => {
    mockedGenres.listGenreCounts.mockResolvedValue({ items: [] });
    renderManager();

    expect(await screen.findByText('No genres yet.')).toBeInTheDocument();
  });
});
