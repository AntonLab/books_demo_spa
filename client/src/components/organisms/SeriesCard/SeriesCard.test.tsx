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
  genre: { id: 4, name: 'Gothic' },
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

  it('heads its own page with a level-2 heading by default', () => {
    renderWithProviders(<SeriesCard series={series} />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'The Ashgrove Chronicles',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'The Ashgrove Chronicles' })
    ).toBeNull();
  });

  it('links its title as a level-4 heading when it is one of several', () => {
    renderWithProviders(<SeriesCard series={series} linked />);

    expect(
      screen.getByRole('heading', {
        level: 4,
        name: 'The Ashgrove Chronicles',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'The Ashgrove Chronicles' })
    ).toHaveAttribute('href', '/search?series=12');
  });

  it('links the genre to its results, in both title forms', () => {
    const { unmount } = renderWithProviders(<SeriesCard series={series} />);

    expect(screen.getByRole('link', { name: 'Gothic' })).toHaveAttribute(
      'href',
      '/search?genre=4'
    );

    unmount();
    renderWithProviders(<SeriesCard series={series} linked />);

    expect(screen.getByRole('link', { name: 'Gothic' })).toHaveAttribute(
      'href',
      '/search?genre=4'
    );
  });

  it('shows no genre link when the series has none', () => {
    renderWithProviders(<SeriesCard series={{ ...series, genre: null }} />);

    expect(screen.queryByRole('link', { name: 'Gothic' })).toBeNull();
  });
});
