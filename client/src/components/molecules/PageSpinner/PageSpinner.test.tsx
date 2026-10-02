import { render, screen } from '@testing-library/react';
import { PageSpinner } from './PageSpinner';

describe('PageSpinner', () => {
  it('announces loading', () => {
    render(<PageSpinner />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
