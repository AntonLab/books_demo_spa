import { fireEvent, render, screen } from '@testing-library/react';
import { AccountAvatar } from './AccountAvatar';

describe('AccountAvatar', () => {
  it('shows the picture when a URL is given', () => {
    render(<AccountAvatar avatarUrl="/api/users/7/avatar?v=1" name="bob" />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/users/7/avatar?v=1');
  });

  it('falls back to the initial when there is no picture', () => {
    render(<AccountAvatar avatarUrl={null} name="bob" />);

    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('falls back to the initial when the picture fails to load', () => {
    // antd's Avatar swaps back to its children (the fallback) once its <img>
    // fires onError — confirmed from antd/es/avatar/Avatar.js's
    // handleImgLoadError, which flips isImgExist to false.
    render(<AccountAvatar avatarUrl="/broken.webp" name="bob" />);

    fireEvent.error(screen.getByRole('img'));

    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
