import { render, screen } from '@testing-library/react';
import { SeriesPage } from './SeriesPage';

// A stub page: it takes no props and has nothing to interact with, so the
// contract is just its heading and its placeholder.
describe('SeriesPage', () => {
  it('renders its heading', () => {
    render(<SeriesPage />);

    expect(screen.getByRole('heading', { name: 'Series' })).toBeInTheDocument();
  });

  it('renders the empty-state placeholder', () => {
    render(<SeriesPage />);

    expect(screen.getByText('Series are not built yet.')).toBeInTheDocument();
  });
});
