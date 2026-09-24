import { screen } from '@testing-library/react';
import { Card } from './Card';
import { renderWithProviders } from '@/test/renderWithProviders';

const props = {
  title: 'The Ashgrove Chronicles',
  authors: [
    {
      id: 3,
      login: 'mhale',
      firstName: 'Margaret',
      lastName: 'Hale',
      avatarUrl: null,
    },
  ],
  description: 'Letters found in a manor that should have stayed shut.',
  genre: null,
  tags: [],
};

describe('Card', () => {
  it('heads its own page with an unlinked level-2 title without an href', () => {
    renderWithProviders(<Card {...props} />);

    expect(
      screen.getByRole('heading', { level: 2, name: props.title })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: props.title })).toBeNull();
  });

  it('links a level-4 title to its href', () => {
    renderWithProviders(<Card {...props} href="/search?series=12" />);

    expect(
      screen.getByRole('heading', { level: 4, name: props.title })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: props.title })).toHaveAttribute(
      'href',
      '/search?series=12'
    );
  });

  it('renders the media and footer it is given', () => {
    renderWithProviders(
      <Card {...props} media={<span>Cover</span>} footer={<span>Draft</span>} />
    );

    expect(screen.getByText('Cover')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });
});
