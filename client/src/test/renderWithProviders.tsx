import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import type { RenderOptions, RenderResult } from '@testing-library/react';
import { createAppStore } from '../store';
import { createTestQueryClient } from './queryClient';
import { appTheme } from '../theme/tokens';
import type { AppStore, RootState } from '../store';

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Partial<RootState>;
  store?: AppStore;
  queryClient?: QueryClient;
  route?: string;
}

// Every component test needs a query client, a store, a router and the app's
// tokens. ConfigProvider is here because App.tsx mounts it in production:
// without it a component reading a custom quark would get `undefined` in
// tests only, and that divergence would be invisible.
//
// The query client is fresh per render unless the test supplies one. A shared
// client would leak cached data between tests, which is the usual way a query
// suite turns order-dependent. Both it and the store are returned so a test
// can seed a session (`queryClient.setQueryData`) or dispatch a UI action
// (`store.dispatch`) without reaching for a second helper.
export function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions = {}
): RenderResult & { store: AppStore; queryClient: QueryClient } {
  const {
    preloadedState,
    store = createAppStore(preloadedState),
    queryClient = createTestQueryClient(),
    route = '/',
    ...renderOptions
  } = options;

  const Wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>
          <ConfigProvider theme={appTheme}>
            <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
          </ConfigProvider>
        </Provider>
      </QueryClientProvider>
    );
  };

  return {
    store,
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}
