import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeriesEditDetailsModal } from './SeriesEditDetailsModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import { genreItem, publicGenre } from '@/test/genres';
import { createTestQueryClient } from '@/test/queryClient';
import { queryKeys } from '@/queries/keys';
import * as genresApi from '@/api/genres';
import * as seriesApi from '@/api/series';
import type { PublicUser, SeriesDetail } from '@/types/api';

jest.mock('@/api/authors');
jest.mock('@/api/genres');
jest.mock('@/api/series');

const mockedGenres = jest.mocked(genresApi);
const mockedSeries = jest.mocked(seriesApi);

const ann = {
  id: 3,
  login: 'ann',
  firstName: 'Ann',
  lastName: 'Author',
  avatarUrl: null,
};

const series: SeriesDetail = {
  id: 12,
  authors: [ann],
  title: 'The Scale Cycle',
  description: 'Dragons, in four parts.',
  tags: ['epic'],
  genre: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  favoriteCount: 0,
  viewerFavoriteId: null,
};

const author: PublicUser = {
  id: ann.id,
  login: 'ann',
  email: 'ann@example.com',
  firstName: 'Ann',
  lastName: 'Author',
  status: 'active',
  role: 'author',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const onClose = jest.fn();
const onGone = jest.fn();

const renderModal = (session: PublicUser = author) => {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.session, session);
  return renderWithProviders(
    <SeriesEditDetailsModal seriesId={12} onClose={onClose} onGone={onGone} />,
    { queryClient }
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenres.mockResolvedValue({
    items: [genreItem(4, 'Gothic')],
  });
  mockedSeries.listSeriesBooks.mockResolvedValue({ items: [] });
});

describe('SeriesEditDetailsModal', () => {
  it('loads the series into the form and saves it, then closes and announces it', async () => {
    mockedSeries.getSeries.mockResolvedValue(series);
    mockedSeries.updateSeries.mockResolvedValue(series);
    renderModal();

    const title = await screen.findByLabelText('Title');
    expect(title).toHaveValue('The Scale Cycle');
    await userEvent.clear(title);
    await userEvent.type(title, 'The Scale Saga');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedSeries.updateSeries).toHaveBeenCalledWith(12, {
      title: 'The Scale Saga',
      description: 'Dragons, in four parts.',
      tags: ['epic'],
      genreId: null,
    });
    expect(await screen.findByText('Series saved.')).toBeInTheDocument();
  });

  it('shows the series’ own genre in the select', async () => {
    mockedSeries.getSeries.mockResolvedValue({
      ...series,
      genre: publicGenre(4, 'Gothic'),
    });
    renderModal();

    // The select's chosen label, rendered beside the combobox.
    expect(await screen.findByText('Gothic')).toBeInTheDocument();
  });

  it('keeps an existing genre on an unrelated save', async () => {
    mockedSeries.getSeries.mockResolvedValue({
      ...series,
      genre: publicGenre(4, 'Gothic'),
    });
    mockedSeries.updateSeries.mockResolvedValue(series);
    renderModal();

    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'The Scale Saga');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockedSeries.updateSeries).toHaveBeenCalled());
    expect(mockedSeries.updateSeries).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ genreId: 4 })
    );
  });

  it('keeps the modal, the message and the typed text when the server refuses', async () => {
    mockedSeries.getSeries.mockResolvedValue(series);
    mockedSeries.updateSeries.mockRejectedValue(new Error('Title is taken'));
    renderModal();

    await userEvent.type(await screen.findByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Title is taken')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title')).toHaveValue('The Scale Cycle!');
    expect(screen.queryByText('Series saved.')).toBeNull();
  });

  it('asks before discarding an edit', async () => {
    mockedSeries.getSeries.mockResolvedValue(series);
    renderModal();

    await userEvent.type(await screen.findByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    // jsdom renders the antd confirm title twice.
    expect((await screen.findAllByText('Discard changes?')).length).not.toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes at once, with no warning, while the series is still loading', async () => {
    mockedSeries.getSeries.mockReturnValue(new Promise(() => {}));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    // Only the unconnected-form warning matters: jsdom logs its own noise when
    // any antd modal opens.
    expect(
      spy.mock.calls.some(([first]) => String(first).includes('not connected'))
    ).toBe(false);
    spy.mockRestore();
  });

  it('shows an error when the series cannot be loaded', async () => {
    mockedSeries.getSeries.mockRejectedValue(new Error('boom'));
    renderModal();

    expect(
      await screen.findByText('Could not load this series.')
    ).toBeInTheDocument();
  });

  it('refuses an account that may not edit the series', async () => {
    mockedSeries.getSeries.mockResolvedValue(series);
    renderModal({ ...author, id: 99 });

    expect(
      await screen.findByText('Only its co-authors can edit this series.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
  });
});

describe('SeriesEditDetailsModal tabs', () => {
  beforeEach(() => mockedSeries.getSeries.mockResolvedValue(series));

  it('opens on Details with the form, Co-authors and Delete series', async () => {
    renderModal();

    expect(
      await screen.findByRole('dialog', { name: 'Edit series' })
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByRole('tab')).map((tab) => tab.textContent)
    ).toEqual(['Details', 'Books']);
    expect(await screen.findByLabelText('Title')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Co-authors' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Add a co-author')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete series' })
    ).toBeInTheDocument();
  });

  it('shows the Series order on the Books tab', async () => {
    renderModal();

    await userEvent.click(await screen.findByRole('tab', { name: 'Books' }));

    expect(
      await screen.findByText(/No books yet\. Add a book to this series/)
    ).toBeInTheDocument();
    expect(mockedSeries.listSeriesBooks).toHaveBeenCalledWith(12);
  });

  it('keeps typed Details values over a Books tab round trip', async () => {
    renderModal();

    await userEvent.type(await screen.findByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('tab', { name: 'Books' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));

    expect(screen.getByLabelText('Title')).toHaveValue('The Scale Cycle!');
  });

  it('gives a Moderator the form and Delete series but no co-author picker', async () => {
    renderModal({ ...author, id: 99, role: 'admin' });

    expect(await screen.findByLabelText('Title')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete series' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a co-author')).toBeNull();
  });

  it('deletes the series once confirmed, closes and reports it gone', async () => {
    mockedSeries.deleteSeries.mockResolvedValue(undefined);
    renderModal();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete series' })
    );
    expect(mockedSeries.deleteSeries).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );

    await waitFor(() => expect(onGone).toHaveBeenCalledTimes(1));
    expect(mockedSeries.deleteSeries).toHaveBeenCalledWith(12);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open with the server message when the delete is refused', async () => {
    mockedSeries.deleteSeries.mockRejectedValue(
      new Error('You may not delete this series')
    );
    renderModal();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete series' })
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' })
    );

    expect(
      await screen.findByText('You may not delete this series')
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onGone).not.toHaveBeenCalled();
  });
});
