import { render, screen } from '@testing-library/react';
import { ProfilePage } from './ProfilePage';

// A stub page: it takes no props and has nothing to interact with, so the
// contract is just its heading and its placeholder.
describe('ProfilePage', () => {
  it('renders its heading', () => {
    render(<ProfilePage />);

    expect(
      screen.getByRole('heading', { name: 'Profile' })
    ).toBeInTheDocument();
  });

  it('renders the empty-state placeholder', () => {
    render(<ProfilePage />);

    expect(
      screen.getByText('Profile settings are not built yet.')
    ).toBeInTheDocument();
  });
});
