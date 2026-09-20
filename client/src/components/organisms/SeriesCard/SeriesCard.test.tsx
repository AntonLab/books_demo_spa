import { screen } from '@testing-library/react';
import { SeriesCard } from './SeriesCard';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { PublicSeries } from '@/types/series';

const series: PublicSeries = {
  id: 12,
  authors: [
    {
      id: 3,
      login: 'mhale',
      firstName: 'Margaret',
      lastName: 'Hale',
      avatarUrl: null,
    },
    {
      id: 4,
      login: 'ipetrov',
      firstName: 'Ivan',
      lastName: 'Petrov',
      avatarUrl: null,
    },
  ],
  title: 'The Ashgrove Chronicles',
  description: 'Letters found in a manor that should have stayed shut.',
  tags: ['gothic', 'mystery'],
  genre: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('SeriesCard', () => {
  it('heads the card with the series title', () => {
    renderWithProviders(<SeriesCard series={series} />);

    expect(
      screen.getByRole('heading', { name: 'The Ashgrove Chronicles' })
    ).toBeInTheDocument();
  });

  it('names every co-author, in credit order', () => {
    renderWithProviders(<SeriesCard series={series} />);

    // The trailing comma on all but the last name pins the order too.
    expect(screen.getByText('Margaret Hale,')).toBeInTheDocument();
    expect(screen.getByText('Ivan Petrov')).toBeInTheDocument();
  });

  it('shows a co-author avatar once they have one', () => {
    const { container } = renderWithProviders(
      <SeriesCard
        series={{
          ...series,
          authors: [
            { ...series.authors[0]!, avatarUrl: '/api/users/3/avatar?v=1' },
          ],
        }}
      />
    );

    expect(
      container.querySelector('img[src="/api/users/3/avatar?v=1"]')
    ).toBeInTheDocument();
  });

  it('shows the description and every tag', () => {
    renderWithProviders(<SeriesCard series={series} />);

    expect(
      screen.getByText('Letters found in a manor that should have stayed shut.')
    ).toBeInTheDocument();
    expect(screen.getByText('gothic')).toBeInTheDocument();
    expect(screen.getByText('mystery')).toBeInTheDocument();
  });
});
