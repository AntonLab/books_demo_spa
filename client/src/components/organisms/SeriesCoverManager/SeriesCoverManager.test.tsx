import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeriesCoverManager } from './SeriesCoverManager';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as seriesApi from '@/api/series';
import type { SeriesDetail } from '@/types/api';

jest.mock('@/api/series');

const mockedSeries = jest.mocked(seriesApi);

const series: SeriesDetail = {
  id: 12,
  coverUrl: null,
  bookCount: 0,
  authors: [],
  title: 'The Scale Cycle',
  description: 'Dragons, in four parts.',
  tags: [],
  genre: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  favoriteCount: 0,
  viewerFavoriteId: null,
};

// antd's Upload hides its real input; the page tests reach for it the same way.
const fileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;

const renderManager = (coverUrl: string | null = null) =>
  renderWithProviders(
    <SeriesCoverManager
      seriesId={12}
      coverUrl={coverUrl}
      title="The Scale Cycle"
    />
  );

beforeEach(() => {
  jest.resetAllMocks();
});

describe('SeriesCoverManager', () => {
  it('offers only an upload while the series has no cover', () => {
    renderManager();

    expect(screen.getByText('Cover')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upload cover' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove cover' })).toBeNull();
  });

  it('shows the placeholder with the series title while there is no cover', () => {
    renderManager();

    expect(screen.getByText('The Scale Cycle')).toBeInTheDocument();
  });

  it('offers Remove once there is a cover to remove', () => {
    renderManager('/api/series/12/cover?v=1');

    expect(
      screen.getByRole('button', { name: 'Remove cover' })
    ).toBeInTheDocument();
  });

  it('uploads the picked file', async () => {
    mockedSeries.uploadSeriesCover.mockResolvedValue({
      ...series,
      coverUrl: '/api/series/12/cover?v=2',
    });
    renderManager();
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', {
      type: 'image/png',
    });

    await userEvent.upload(fileInput(), file);

    await waitFor(() =>
      expect(mockedSeries.uploadSeriesCover).toHaveBeenCalledWith(12, file)
    );
  });

  it('explains a rejected file without calling the API, and clears that once a good one is picked', async () => {
    // user-event v14 applies the input's `accept` attribute by default, which
    // would drop the .gif before it ever reached the precheck.
    const user = userEvent.setup({ applyAccept: false });
    mockedSeries.uploadSeriesCover.mockResolvedValue(series);
    renderManager();

    await user.upload(
      fileInput(),
      new File([new Uint8Array([1])], 'cover.gif', { type: 'image/gif' })
    );

    expect(mockedSeries.uploadSeriesCover).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Choose a JPEG, PNG or WebP image.')
    ).toBeInTheDocument();

    await user.upload(
      fileInput(),
      new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' })
    );

    expect(screen.queryByText('Choose a JPEG, PNG or WebP image.')).toBeNull();
  });

  it('shows the server error when an upload fails', async () => {
    mockedSeries.uploadSeriesCover.mockRejectedValue(
      new Error('Not a valid image')
    );
    renderManager();

    await userEvent.upload(
      fileInput(),
      new File([new Uint8Array([1])], 'cover.png', { type: 'image/png' })
    );

    expect(await screen.findByText('Not a valid image')).toBeInTheDocument();
  });

  it('removes the cover only once the removal is confirmed', async () => {
    mockedSeries.deleteSeriesCover.mockResolvedValue(undefined);
    renderManager('/api/series/12/cover?v=1');

    await userEvent.click(screen.getByRole('button', { name: 'Remove cover' }));
    expect(mockedSeries.deleteSeriesCover).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    await waitFor(() =>
      expect(mockedSeries.deleteSeriesCover).toHaveBeenCalledWith(12)
    );
  });

  it('shows the server error when a removal fails', async () => {
    mockedSeries.deleteSeriesCover.mockRejectedValue(
      new Error('Could not remove the cover')
    );
    renderManager('/api/series/12/cover?v=1');

    await userEvent.click(screen.getByRole('button', { name: 'Remove cover' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

    expect(
      await screen.findByText('Could not remove the cover')
    ).toBeInTheDocument();
  });
});
