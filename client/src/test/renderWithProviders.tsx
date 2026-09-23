import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import type { RenderOptions, RenderResult } from '@testing-library/react';
import { createTestQueryClient } from './queryClient';
import { appTheme } from '../theme/tokens';

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
  route?: string;
  // Only for a page that reads route params. Without a matched Route,
  // `useParams()` returns an empty object under MemoryRouter, so a page doing
  // `Number(id)` would query for NaN. Omit it and the children render directly,
  // exactly as before.
  path?: string;
}

// Every component test needs a query client, a router and the app's
// tokens. ConfigProvider is here because App.tsx mounts it in production:
// without it a component reading a custom quark would get `undefined` in
// tests only, and that divergence would be invisible.
//
// It mirrors production in everything but one flag. `zeroRuntime` stops antd
// injecting its CSS-in-JS rules; the DOM, class names and tokens stay the
// same. With the rules in place every getComputedStyle — which role queries,
// user-event's pointer-events check and antd's popup alignment all call —
// matches each element against well over a thousand of them, cold again after
// every render, and they pile up across a file's tests. That put single tests
// past Jest's 5 s timeout under a loaded run. The price: a role query no longer
// treats an element hidden only by antd's stylesheet as hidden.
//
// The query client is fresh per render unless the test supplies one. A shared
// client would leak cached data between tests, which is the usual way a query
// suite turns order-dependent. It is returned so a test can seed a session
// (`queryClient.setQueryData`) without reaching for a second helper.
export const renderWithProviders = (
  ui: ReactElement,
  options: ProviderOptions = {}
): RenderResult & { queryClient: QueryClient } => {
  const {
    queryClient = createTestQueryClient(),
    route = '/',
    path,
    ...renderOptions
  } = options;

  const Wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={{ ...appTheme, zeroRuntime: true }}>
          <MemoryRouter initialEntries={[route]}>
            {path ? (
              <Routes>
                <Route path={path} element={children} />
              </Routes>
            ) : (
              children
            )}
          </MemoryRouter>
        </ConfigProvider>
      </QueryClientProvider>
    );
  };

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
};
