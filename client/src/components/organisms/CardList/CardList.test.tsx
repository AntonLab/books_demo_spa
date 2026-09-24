import { screen } from '@testing-library/react';
import { CardList } from './CardList';
import { renderWithProviders } from '@/test/renderWithProviders';

const items = [
  { id: 1, title: 'A Tale of Dragons' },
  { id: 2, title: 'The Ashgrove Chronicles' },
];

const states = { isPending: false, isError: false, error: null };

describe('CardList', () => {
  it('shows a loading state named by its noun while the request is in flight', () => {
    renderWithProviders(
      <CardList
        noun="series"
        items={[]}
        renderItem={() => null}
        {...states}
        isPending={true}
      />
    );

    expect(screen.getByLabelText('Loading series')).toBeInTheDocument();
  });

  it('shows the error message when loading failed', () => {
    renderWithProviders(
      <CardList
        noun="books"
        items={[]}
        renderItem={() => null}
        {...states}
        isError={true}
        error={new Error('Network down')}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
  });

  it('falls back to a generic message when the error carries none', () => {
    renderWithProviders(
      <CardList
        noun="books"
        items={[]}
        renderItem={() => null}
        {...states}
        isError={true}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load books');
  });

  it('shows the default empty message when there is nothing to list', () => {
    renderWithProviders(
      <CardList noun="books" items={[]} renderItem={() => null} {...states} />
    );

    expect(screen.getByText('No books yet.')).toBeInTheDocument();
  });

  it('shows a caller-supplied empty message', () => {
    renderWithProviders(
      <CardList
        noun="books"
        items={[]}
        renderItem={() => null}
        {...states}
        emptyText='No books match "dragon"'
      />
    );

    expect(screen.getByText('No books match "dragon"')).toBeInTheDocument();
  });

  it('renders every item through renderItem, in order', () => {
    renderWithProviders(
      <CardList
        noun="books"
        items={items}
        renderItem={(item) => <p>{item.title}</p>}
        {...states}
      />
    );

    expect(
      screen.getAllByRole('paragraph').map((node) => node.textContent)
    ).toEqual(['A Tale of Dragons', 'The Ashgrove Chronicles']);
  });
});
