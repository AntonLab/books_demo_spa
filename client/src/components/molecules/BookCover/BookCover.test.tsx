import { fireEvent, screen } from '@testing-library/react';
import { BookCover } from './BookCover';
import { renderWithProviders } from '@/test/renderWithProviders';
import { appTheme } from '@/theme/tokens';

describe('BookCover', () => {
  it('shows the cover image, decoratively, when a URL is given', () => {
    const { container } = renderWithProviders(
      <BookCover coverUrl="/api/books/1/cover?v=1" title="A Tale of Dragons" />
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/api/books/1/cover?v=1');
    expect(img).toHaveAttribute('alt', '');
  });

  it('shows a placeholder bearing the title when there is no cover', () => {
    const { container } = renderWithProviders(
      <BookCover coverUrl={null} title="A Tale of Dragons" />
    );

    const placeholder = screen.getByText('A Tale of Dragons');
    expect(placeholder).toBeInTheDocument();
    // Decorative: the visible title always sits beside this frame, so the
    // placeholder's own copy must stay out of the accessibility tree.
    expect(placeholder).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back to the placeholder when the image fails to load', () => {
    const { container } = renderWithProviders(
      <BookCover coverUrl="/broken.webp" title="A Tale of Dragons" />
    );

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(screen.getByText('A Tale of Dragons')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('tries a new coverUrl again after a previous one failed', () => {
    // Known defect this fixes: a bare `failed` boolean never resets, so a
    // freshly-uploaded cover (a new `?v=` URL) would stay stuck on the
    // placeholder from an earlier, unrelated failure.
    const { container, rerender } = renderWithProviders(
      <BookCover coverUrl="/broken.webp" title="A Tale of Dragons" />
    );
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();

    rerender(
      <BookCover coverUrl="/fresh.webp?v=2" title="A Tale of Dragons" />
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/fresh.webp?v=2');
    expect(screen.queryByText('A Tale of Dragons')).toBeNull();
  });

  it('sizes the frame from the appBookCoverWidth quark, a 2:3 ratio', () => {
    const { container } = renderWithProviders(
      <BookCover coverUrl={null} title="A Tale of Dragons" />
    );

    const width = appTheme.token?.appBookCoverWidth;
    const frame = container.firstChild as HTMLElement;
    expect(frame).toHaveStyle({
      width: `${width}px`,
      height: `${Number(width) * 1.5}px`,
    });
  });
});
