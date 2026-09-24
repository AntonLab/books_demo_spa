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

  it('as a tile, also links its media, out of reach of keyboard and screen reader', () => {
    renderWithProviders(
      <Card {...props} href="/books/1" tile media={<span>Cover</span>} />
    );

    // The title is the one link assistive technology meets.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    const mediaLink = screen.getByText('Cover').closest('a');
    expect(mediaLink).toHaveAttribute('href', '/books/1');
    expect(mediaLink).toHaveAttribute('aria-hidden', 'true');
    expect(mediaLink).toHaveAttribute('tabindex', '-1');
  });

  it('as a tile, leaves out the genre and the tags', () => {
    renderWithProviders(
      <Card
        {...props}
        href="/books/1"
        tile
        genre={{ id: 4, name: 'Gothic' }}
        tags={['epic']}
      />
    );

    expect(screen.queryByText('Gothic')).toBeNull();
    expect(screen.queryByText('epic')).toBeNull();
    expect(screen.getByText(props.description)).toBeInTheDocument();
  });

  it('leaves out the description when it is given none', () => {
    renderWithProviders(
      <Card {...props} description={undefined} href="/books/1" tile />
    );

    expect(screen.queryByText(props.description)).toBeNull();
  });
});
