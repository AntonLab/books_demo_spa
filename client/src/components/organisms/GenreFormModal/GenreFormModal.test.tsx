import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GENRE_NAME_MAX_LENGTH } from 'shared';
import { GenreFormModal } from './GenreFormModal';
import type { GenreFormMode } from './GenreFormModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import { adminGenre } from '@/test/genres';
import { ApiError } from '@/api/client';
import * as genresApi from '@/api/genres';

jest.mock('@/api/genres');

const mockedGenres = jest.mocked(genresApi);

const fantasy = adminGenre(1, 'Fantasy');
const urban = adminGenre(2, 'Urban', 1);
const genres = [fantasy, urban, adminGenre(3, 'Horror')];

const onClose = jest.fn();

const renderModal = (mode: GenreFormMode) =>
  renderWithProviders(
    <GenreFormModal mode={mode} genres={genres} onClose={onClose} />
  );

const editSubgenre: GenreFormMode = { kind: 'edit', genre: urban };

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.createGenre.mockResolvedValue({
    id: 9,
    name: 'Noir',
    parent: null,
  });
  mockedGenres.updateGenre.mockResolvedValue({
    id: 2,
    name: 'Dark',
    parent: null,
  });
});

const saveButton = () => screen.getByRole('button', { name: 'Save' });

describe('GenreFormModal', () => {
  it('creates a top-level Genre without a parentId', async () => {
    const user = userEvent.setup();
    renderModal({ kind: 'create', parentId: null });

    await user.type(screen.getByLabelText('Genre name'), 'Noir');
    await user.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockedGenres.createGenre).toHaveBeenCalledWith({ name: 'Noir' });
  });

  it('creates a Subgenre under the chosen Genre', async () => {
    const user = userEvent.setup();
    renderModal({ kind: 'create', parentId: 1 });

    expect(screen.getByText('Fantasy')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Genre name'), 'Noir');
    await user.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockedGenres.createGenre).toHaveBeenCalledWith({
      name: 'Noir',
      parentId: 1,
    });
  });

  it('trims the name and caps its length', async () => {
    const user = userEvent.setup();
    renderModal({ kind: 'create', parentId: null });

    const input = screen.getByLabelText('Genre name');
    expect(input).toHaveAttribute('maxLength', String(GENRE_NAME_MAX_LENGTH));
    await user.type(input, '  Noir  ');
    await user.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockedGenres.createGenre).toHaveBeenCalledWith({ name: 'Noir' });
  });

  it('disables Save and sends nothing when an edit changed nothing', async () => {
    const user = userEvent.setup();
    renderModal(editSubgenre);

    expect(saveButton()).toBeDisabled();
    await user.click(saveButton());
    expect(mockedGenres.updateGenre).not.toHaveBeenCalled();
  });

  it('sends only the name on a rename', async () => {
    const user = userEvent.setup();
    renderModal(editSubgenre);

    const input = screen.getByLabelText('Genre name');
    await user.clear(input);
    await user.type(input, 'Dark');
    await user.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockedGenres.updateGenre).toHaveBeenCalledWith(2, { name: 'Dark' });
  });

  it('sends parentId null when a Subgenre moves to the top level', async () => {
    const user = userEvent.setup();
    renderModal(editSubgenre);

    await user.click(screen.getByLabelText('Parent'));
    await user.click(await screen.findByTitle('None (top level)'));
    await user.click(saveButton());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockedGenres.updateGenre).toHaveBeenCalledWith(2, {
      parentId: null,
    });
  });

  it('offers a Genre that has Subgenres only the top level', async () => {
    const user = userEvent.setup();
    renderModal({ kind: 'edit', genre: fantasy });

    await user.click(screen.getByLabelText('Parent'));
    expect(await screen.findAllByRole('option')).toHaveLength(1);
    expect(screen.queryByTitle('Horror')).not.toBeInTheDocument();
  });

  it('shows a 409 under the name and stays open', async () => {
    const user = userEvent.setup();
    mockedGenres.createGenre.mockRejectedValue(
      new ApiError(409, 'A genre with this name already exists here')
    );
    renderModal({ kind: 'create', parentId: null });

    await user.type(screen.getByLabelText('Genre name'), 'Noir');
    await user.click(saveButton());

    expect(
      await screen.findByText('A genre with this name already exists here')
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows any other error in an alert and stays open', async () => {
    const user = userEvent.setup();
    mockedGenres.createGenre.mockRejectedValue(new ApiError(500, 'Boom'));
    renderModal({ kind: 'create', parentId: null });

    await user.type(screen.getByLabelText('Genre name'), 'Noir');
    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    expect(onClose).not.toHaveBeenCalled();
  });
});
