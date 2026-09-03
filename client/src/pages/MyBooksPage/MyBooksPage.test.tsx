import { render, screen } from '@testing-library/react';
import { MyBooksPage } from './MyBooksPage';

// A stub page: it takes no props and has nothing to interact with, so the
// contract is just its heading and its placeholder.
describe('MyBooksPage', () => {
  it('renders its heading', () => {
    render(<MyBooksPage />);

    expect(
      screen.getByRole('heading', { name: 'My Books' })
    ).toBeInTheDocument();
  });

  it('renders the empty-state placeholder', () => {
    render(<MyBooksPage />);

    expect(
      screen.getByText('Your books are not built yet.')
    ).toBeInTheDocument();
  });
});
