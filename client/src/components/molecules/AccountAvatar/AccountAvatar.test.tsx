import { fireEvent, render, screen } from '@testing-library/react';
import { AccountAvatar } from './AccountAvatar';

describe('AccountAvatar', () => {
  it('shows the picture when a URL is given', () => {
    // Not getByRole('img'): the avatar is aria-hidden (see the decorative
    // test below), so a container query is the unambiguous way to reach it.
    const { container } = render(
      <AccountAvatar avatarUrl="/api/users/7/avatar?v=1" name="bob" />
    );

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/users/7/avatar?v=1'
    );
  });

  it('falls back to the initial when there is no picture', () => {
    render(<AccountAvatar avatarUrl={null} name="bob" />);

    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('falls back to the initial when the picture fails to load', () => {
    // antd's Avatar swaps back to its children (the fallback) once its <img>
    // fires onError — confirmed from antd/es/avatar/Avatar.js's
    // handleImgLoadError, which flips isImgExist to false.
    const { container } = render(
      <AccountAvatar avatarUrl="/broken.webp" name="bob" />
    );

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(screen.getByText('B')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('is decorative: the image carries no alt text and the whole avatar is hidden from assistive tech', () => {
    // A name always sits beside this component at every call site, so an
    // <img> with no alt would otherwise leave a screen reader reading out
    // its `?v=` URL — confirmed from antd/es/avatar/Avatar.js, which
    // forwards `alt` straight to the <img> it renders.
    const { container } = render(
      <AccountAvatar avatarUrl="/api/users/7/avatar?v=1" name="bob" />
    );

    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('hides the fallback initial from assistive tech too', () => {
    const { container } = render(<AccountAvatar avatarUrl={null} name="bob" />);

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
