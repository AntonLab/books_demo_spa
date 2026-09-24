import { screen } from '@testing-library/react';
import { theme } from 'antd';
import type { FC } from 'react';
import { renderWithProviders } from '@/test/renderWithProviders';

// renderWithProviders mounts ThemedConfigProvider exactly as App does, so the
// token a component reads is the one production would give it.
const TokenProbe: FC = () => {
  const { token } = theme.useToken();
  return (
    <>
      <p data-testid="background">{token.colorBgContainer}</p>
      <p data-testid="cover-width">{token.appBookCoverWidth}</p>
    </>
  );
};

describe('ThemedConfigProvider', () => {
  it('gives a rendered component dark tokens when the device prefers dark', () => {
    const { unmount } = renderWithProviders(<TokenProbe />);
    const light = screen.getByTestId('background').textContent;
    unmount();

    renderWithProviders(<TokenProbe />, {
      preloadedState: {
        devicePreferences: {
          theme: 'dark',
          resultsLayout: 'grid',
          searchFormExpanded: true,
        },
      },
    });

    expect(screen.getByTestId('background').textContent).not.toBe(light);
  });

  it('sets the page color-scheme to the theme, for native controls', () => {
    const { unmount } = renderWithProviders(<TokenProbe />, {
      preloadedState: {
        devicePreferences: {
          theme: 'dark',
          resultsLayout: 'grid',
          searchFormExpanded: true,
        },
      },
    });
    expect(
      document.documentElement.style.getPropertyValue('color-scheme')
    ).toBe('dark');
    unmount();

    renderWithProviders(<TokenProbe />);
    expect(
      document.documentElement.style.getPropertyValue('color-scheme')
    ).toBe('light');
  });

  it('keeps the app quarks in the dark theme', () => {
    renderWithProviders(<TokenProbe />, {
      preloadedState: {
        devicePreferences: {
          theme: 'dark',
          resultsLayout: 'grid',
          searchFormExpanded: true,
        },
      },
    });

    expect(screen.getByTestId('cover-width')).toHaveTextContent('96');
  });
});
