import { screen } from '@testing-library/react';
import { SeriesCard } from './SeriesCard';
import { renderWithProviders } from '@/test/renderWithProviders';
import { publicGenre } from '@/test/genres';
import type { PublicSeries } from '@/types/api';

const series: PublicSeries = {
  id: 12,
  coverUrl: null,
  bookCount: 0,
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
  genre: publicGenre(4, 'Gothic'),
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

  it('links the genre to its results', () => {
    renderWithProviders(<SeriesCard series={series} />);

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

it('shows the title as a placeholder while the series has no cover', () => {
  const { container } = renderWithProviders(<SeriesCard series={series} />);

  expect(container.querySelector('img')).toBeNull();
  // BookCover's placeholder is aria-hidden, so only the heading names the series.
  expect(screen.getAllByText('The Ashgrove Chronicles')).toHaveLength(2);
});

it('shows the cover image once the series has one', () => {
  const { container } = renderWithProviders(
    <SeriesCard series={{ ...series, coverUrl: '/api/series/12/cover?v=1' }} />
  );

  expect(
    container.querySelector('img[src="/api/series/12/cover?v=1"]')
  ).toBeInTheDocument();
});

it.each([
  [0, '0 books'],
  [1, '1 book'],
  [3, '3 books'],
])('says %i Published books as "%s"', (bookCount, text) => {
  renderWithProviders(<SeriesCard series={{ ...series, bookCount }} />);

  expect(screen.getByText(text)).toBeInTheDocument();
});

it('links its title to href when given one, as a list row', () => {
  renderWithProviders(<SeriesCard series={series} href="/series/12" />);

  expect(
    screen.getByRole('link', { name: 'The Ashgrove Chronicles' })
  ).toHaveAttribute('href', '/series/12');
});
