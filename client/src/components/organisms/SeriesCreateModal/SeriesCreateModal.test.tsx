import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { message } from 'antd';
import { SeriesCreateModal } from './SeriesCreateModal';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as genresApi from '@/api/genres';
import * as seriesApi from '@/api/series';
import type { PublicSeries } from '@/types/api';

jest.mock('@/api/genres');
jest.mock('@/api/series');

const mockedGenres = jest.mocked(genresApi);
const mockedSeries = jest.mocked(seriesApi);

const created: PublicSeries = {
  id: 9,
  authors: [
    {
      id: 3,
      login: 'ann',
      firstName: 'Ann',
      lastName: 'Author',
      avatarUrl: null,
    },
  ],
  title: 'The Scale Cycle',
  description: 'Dragons, in four parts.',
  tags: [],
  genre: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const renderModal = ({ onClose }: { onClose: () => void }) =>
  renderWithProviders(<SeriesCreateModal onClose={onClose} />);

const type = async () => {
  await userEvent.type(screen.getByLabelText('Title'), 'The Scale Cycle');
  await userEvent.type(
    screen.getByLabelText('Description'),
    'Dragons, in four parts.'
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedGenres.listGenres.mockResolvedValue({ items: [] });
});

// The static message API outlives a test's DOM, so a toast would leak into the next test.
afterEach(() => message.destroy());

describe('SeriesCreateModal', () => {
  it('creates the series with explicit nulls, closes and announces it', async () => {
    mockedSeries.createSeries.mockResolvedValue(created);
    const onClose = jest.fn();
    renderModal({ onClose });
    expect(
      screen.getByRole('dialog', { name: 'Create series' })
    ).toBeInTheDocument();

    await type();
    await userEvent.click(
      screen.getByRole('button', { name: 'Create series' })
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockedSeries.createSeries).toHaveBeenCalledWith({
      title: 'The Scale Cycle',
      description: 'Dragons, in four parts.',
      tags: [],
      genreId: null,
    });
    expect(await screen.findByText('Series created.')).toBeInTheDocument();
  });

  it('stays open with the server message and the typed values on a refusal', async () => {
    mockedSeries.createSeries.mockRejectedValue(new Error('Title is taken'));
    const onClose = jest.fn();
    renderModal({ onClose });

    await type();
    await userEvent.click(
      screen.getByRole('button', { name: 'Create series' })
    );

    expect(await screen.findByText('Title is taken')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title')).toHaveValue('The Scale Cycle');
    expect(screen.queryByText('Series created.')).toBeNull();
  });

  it('asks before discarding typed input', async () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    await userEvent.type(screen.getByLabelText('Title'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect((await screen.findAllByText('Discard changes?')).length).not.toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });
});
