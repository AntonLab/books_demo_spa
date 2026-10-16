import { screen } from '@testing-library/react';
import { NameLink } from './NameLink';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('NameLink', () => {
  it('links the name of an Active Account to its public profile', () => {
    renderWithProviders(
      <NameLink id={7} name="Margaret Hale" status="active" />
    );

    expect(screen.getByRole('link', { name: 'Margaret Hale' })).toHaveAttribute(
      'href',
      '/accounts/7'
    );
  });

  it.each(['blocked', 'pending'] as const)(
    'shows the name of a %s Account as plain text',
    (status) => {
      renderWithProviders(
        <NameLink id={7} name="Margaret Hale" status={status} />
      );

      expect(screen.getByText('Margaret Hale')).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    }
  );
});
