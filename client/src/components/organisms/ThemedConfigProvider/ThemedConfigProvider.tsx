import { useEffect } from 'react';
import type { FC, ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { useAppSelector } from '@/store/hooks';
import { appTheme } from '@/theme/tokens';

interface ThemedConfigProviderProps {
  children: ReactNode;
  // Tests only: renderWithProviders sets it to skip antd's CSS-in-JS
  // injection (see src/test/renderWithProviders.tsx).
  zeroRuntime?: boolean;
}

// Shared by App and renderWithProviders so a test sees the tokens production
// does. CSS Modules read `var(--ant-*)`, so they follow the algorithm with no
// change of their own (ADR-0009).
export const ThemedConfigProvider: FC<ThemedConfigProviderProps> = ({
  children,
  zeroRuntime,
}) => {
  const theme = useAppSelector((state) => state.devicePreferences.theme);

  // antd's algorithm reaches only antd's own tokens; scrollbars, native
  // pickers and autofill follow the page's color-scheme instead.
  useEffect(() => {
    document.documentElement.style.setProperty('color-scheme', theme);
  }, [theme]);

  return (
    <ConfigProvider
      theme={{
        ...appTheme,
        algorithm:
          theme === 'dark'
            ? antdTheme.darkAlgorithm
            : antdTheme.defaultAlgorithm,
        zeroRuntime,
      }}
    >
      {children}
    </ConfigProvider>
  );
};
