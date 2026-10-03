import { screen } from '@testing-library/react';
import { NameLink } from './NameLink';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('NameLink', () => {
  it('links the name to the public profile of that Account', () => {
    renderWithProviders(<NameLink id={7} name="Margaret Hale" />);

    expect(screen.getByRole('link', { name: 'Margaret Hale' })).toHaveAttribute(
      'href',
      '/accounts/7'
    );
  });
});
