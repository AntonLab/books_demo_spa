import { App as AntdApp } from 'antd';
import { render, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { QueryClient } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import type {
  RenderHookResult,
  RenderOptions,
  RenderResult,
} from '@testing-library/react';
import { ThemedConfigProvider } from '../components/organisms/ThemedConfigProvider/ThemedConfigProvider';
import { createAppStore } from '../store';
import type { AppStore, RootState } from '../store';
import { createTestQueryClient } from './queryClient';

interface ProviderSetup {
  preloadedState?: Partial<RootState>;
  store?: AppStore;
  queryClient?: QueryClient;
  route?: string;
  // Only for a page that reads route params. Without a matched Route,
  // `useParams()` returns an empty object under MemoryRouter, so a page doing
  // `Number(id)` would query for NaN. Omit it and the children render directly.
  path?: string;
}

type ProviderOptions = ProviderSetup & Omit<RenderOptions, 'wrapper'>;

// ThemedConfigProvider is the one App mounts: without it a component reading a
// custom quark or the dark algorithm would see something else in tests only.
//
// It mirrors production except for `zeroRuntime`, which stops antd injecting
// its CSS-in-JS rules; the DOM, class names and tokens stay the same. With the
// rules in place every getComputedStyle (role queries, user-event's
// pointer-events check, antd's popup alignment) matches each element against
// over a thousand of them, cold after every render, which pushed single tests
// past Jest's 5 s timeout under a loaded run. The price: a role query no longer
// treats an element hidden only by antd's stylesheet as hidden.
//
// The query client is fresh per render unless the test supplies one, so cached
// data cannot leak between tests. The store starts from `preloadedState` or
// `{}`, never from localStorage, which a previous test may have written. Both
// are returned so a test can seed a session (`queryClient.setQueryData`), read
// client state (`store.getState()`), or remount on the same store.
const setUpProviders = ({
  preloadedState = {},
  store = createAppStore(preloadedState),
  queryClient = createTestQueryClient(),
  route = '/',
  path,
}: ProviderSetup) => {
  const Wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>
          <ThemedConfigProvider zeroRuntime>
            {/* Same as App: toasts come from App.useApp(). Its holder
                unmounts with the render, so no toast outlives a test.
                `component={false}` skips the wrapper div, which would
                break `container` being empty for a component that renders
                nothing. */}
            <AntdApp component={false}>
              <MemoryRouter initialEntries={[route]}>
                {path ? (
                  <Routes>
                    <Route path={path} element={children} />
                  </Routes>
                ) : (
                  children
                )}
              </MemoryRouter>
            </AntdApp>
          </ThemedConfigProvider>
        </Provider>
      </QueryClientProvider>
    );
  };
  return { store, queryClient, Wrapper };
};

export const renderWithProviders = (
  ui: ReactElement,
  options: ProviderOptions = {}
): RenderResult & { store: AppStore; queryClient: QueryClient } => {
  const { preloadedState, store, queryClient, route, path, ...renderOptions } =
    options;
  const providers = setUpProviders({
    preloadedState,
    store,
    queryClient,
    route,
    path,
  });

  return {
    store: providers.store,
    queryClient: providers.queryClient,
    ...render(ui, { wrapper: providers.Wrapper, ...renderOptions }),
  };
};

// The same providers around a hook, for a hook that reads both the session
// and the store.
export const renderHookWithProviders = <Result,>(
  hook: () => Result,
  options: ProviderSetup = {}
): RenderHookResult<Result, unknown> & {
  store: AppStore;
  queryClient: QueryClient;
} => {
  const { store, queryClient, Wrapper } = setUpProviders(options);
  return { store, queryClient, ...renderHook(hook, { wrapper: Wrapper }) };
};
