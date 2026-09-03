import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FC } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

// React logs every error it catches to console.error. Silence it so a passing
// run stays readable.
const consoleError = jest
  .spyOn(console, 'error')
  .mockImplementation(() => undefined);

afterAll(() => {
  consoleError.mockRestore();
});

const Boom: FC = () => {
  throw new Error('kaboom');
};

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
    expect(
      screen.queryByText('Something went wrong on this page')
    ).not.toBeInTheDocument();
  });

  it('renders the fallback, with the error message, when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(
      screen.getByText('Something went wrong on this page')
    ).toBeInTheDocument();
    expect(screen.getByText('kaboom')).toBeInTheDocument();
  });

  it('clears the error when "Try again" is pressed', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText('kaboom')).toBeInTheDocument();

    // Swapping in a child that does not throw is not enough on its own: the
    // boundary holds the error until it is reset, so the fallback stays up.
    rerender(
      <ErrorBoundary>
        <p>recovered</p>
      </ErrorBoundary>
    );
    expect(screen.queryByText('recovered')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
});
