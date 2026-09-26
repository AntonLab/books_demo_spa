import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FC } from 'react';
import * as measurePages from './measurePages';
import { pageIndicator } from './pagination';
import { usePages } from './usePages';
import type { UsePagesOptions } from './usePages';
import { initialReadingPreferences } from '@/store/devicePreferencesSlice';

jest.mock('./measurePages');

const measure = jest.mocked(measurePages);

const GEOMETRY: measurePages.Geometry = {
  pageWidth: 500,
  pageHeight: 600,
  perView: 1,
  gap: 32,
};

const Harness: FC<UsePagesOptions> = (options) => {
  const {
    probeRef,
    stripRef,
    animate,
    stripStyle,
    start,
    pageCount,
    perView,
    turn,
  } = usePages(options);
  return (
    <>
      <div ref={probeRef} />
      <div
        ref={stripRef}
        data-testid="strip"
        data-animate={animate}
        style={stripStyle}
      />
      <p>{pageIndicator(start, pageCount, perView)}</p>
      <button type="button" onClick={() => turn('previous')}>
        Back
      </button>
      <button type="button" onClick={() => turn('next')}>
        Forward
      </button>
    </>
  );
};

const options = (
  overrides: Partial<UsePagesOptions> = {}
): UsePagesOptions => ({
  enabled: true,
  chapterId: 1,
  text: 'It was a dark night.',
  reading: { ...initialReadingPreferences, layout: 'pages' },
  openOnLastPage: false,
  ...overrides,
});

const forward = () =>
  userEvent.click(screen.getByRole('button', { name: 'Forward' }));

beforeEach(() => {
  jest.resetAllMocks();
  // A fresh object per call, as the real measurement returns.
  measure.measureGeometry.mockImplementation(() => ({ ...GEOMETRY }));
  measure.countPages.mockReturnValue(3);
  measure.pageOfChild.mockReturnValue(0);
  measure.childOnPage.mockReturnValue(0);
});

describe('usePages', () => {
  it('opens a chapter on its first page, still', () => {
    render(<Harness {...options()} />);

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(measure.measureGeometry).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      'medium',
      expect.objectContaining({ gap: expect.any(Number) })
    );
    const strip = screen.getByTestId('strip');
    expect(strip).toHaveStyle({ transform: 'translateX(0px)' });
    expect(strip).toHaveAttribute('data-animate', 'false');
  });

  it('turns one page at a time, sliding, and stops at the last', async () => {
    render(<Harness {...options()} />);

    await forward();

    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    const strip = screen.getByTestId('strip');
    expect(strip).toHaveStyle({ transform: 'translateX(-532px)' });
    expect(strip).toHaveAttribute('data-animate', 'true');

    await forward();
    await forward();
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('turns a spread two pages at a time', async () => {
    measure.measureGeometry.mockImplementation(() => ({
      ...GEOMETRY,
      perView: 2,
    }));
    render(<Harness {...options()} />);

    expect(screen.getByText('Pages 1–2 of 3')).toBeInTheDocument();

    await forward();

    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByTestId('strip')).toHaveStyle({
      transform: 'translateX(-1064px)',
    });
  });

  it('opens on the last page, without sliding, when asked', () => {
    render(<Harness {...options({ openOnLastPage: true })} />);

    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByTestId('strip')).toHaveAttribute(
      'data-animate',
      'false'
    );
  });

  it('opens the next chapter on its first page, still', async () => {
    const { rerender } = render(<Harness {...options()} />);
    await forward();

    rerender(<Harness {...options({ chapterId: 2, text: 'Morning.' })} />);

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByTestId('strip')).toHaveAttribute(
      'data-animate',
      'false'
    );
  });

  it('opens a previous chapter on its last page, and stays there once the state is gone', () => {
    const { rerender } = render(<Harness {...options()} />);

    rerender(
      <Harness
        {...options({ chapterId: 2, text: 'Morning.', openOnLastPage: true })}
      />
    );
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();

    rerender(<Harness {...options({ chapterId: 2, text: 'Morning.' })} />);
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
  });

  it('keeps the first visible paragraph in view after a font size change', async () => {
    measure.childOnPage.mockReturnValue(4);
    const { rerender } = render(<Harness {...options()} />);
    await forward();
    measure.countPages.mockReturnValue(5);
    measure.pageOfChild.mockReturnValue(2);

    rerender(
      <Harness
        {...options({
          reading: {
            ...initialReadingPreferences,
            layout: 'pages',
            fontSize: 20,
          },
        })}
      />
    );

    expect(screen.getByText('Page 3 of 5')).toBeInTheDocument();
    const strip = screen.getByTestId('strip');
    expect(measure.pageOfChild).toHaveBeenLastCalledWith(strip, 4, GEOMETRY);
    expect(strip).toHaveAttribute('data-animate', 'false');
  });

  it('measures again on a window resize', () => {
    render(<Harness {...options()} />);
    measure.measureGeometry.mockImplementation(() => ({
      ...GEOMETRY,
      perView: 2,
    }));

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.getByText('Pages 1–2 of 3')).toBeInTheDocument();
  });

  it('measures nothing in the Scroll layout', () => {
    render(<Harness {...options({ enabled: false })} />);

    expect(measure.measureGeometry).not.toHaveBeenCalled();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });
});
