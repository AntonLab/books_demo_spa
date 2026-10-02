import { screen } from '@testing-library/react';
import { GenrePath } from './GenrePath';
import { renderWithProviders } from '@/test/renderWithProviders';
import { publicGenre } from '@/test/genres';
import { searchPath } from '@/types/bookSearch';

describe('GenrePath', () => {
  it('links the parent and the Subgenre, joined by a hidden separator', () => {
    const { container } = renderWithProviders(
      <GenrePath
        genre={publicGenre(2, 'Urban Fantasy', { id: 1, name: 'Fantasy' })}
      />
    );

    expect(screen.getByRole('link', { name: 'Fantasy' })).toHaveAttribute(
      'href',
      searchPath({ genre: '1' })
    );
    expect(screen.getByRole('link', { name: 'Urban Fantasy' })).toHaveAttribute(
      'href',
      searchPath({ genre: '2' })
    );
    expect(container.textContent).toBe('Fantasy / Urban Fantasy');
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      '/'
    );
  });

  it('links a top-level Genre alone', () => {
    renderWithProviders(<GenrePath genre={publicGenre(3, 'Horror')} />);

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Horror' })).toHaveAttribute(
      'href',
      searchPath({ genre: '3' })
    );
  });
});
