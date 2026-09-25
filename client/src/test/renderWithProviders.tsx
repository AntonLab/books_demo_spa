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
  // `Number(id)` would query for NaN. Omit it and the children render directly,
  // exactly as before.
  path?: string;
}

type ProviderOptions = ProviderSetup & Omit<RenderOptions, 'wrapper'>;

// Every component test needs a query client, a store, a router and the app's
// tokens. ThemedConfigProvider is the one App mounts: without it a component
// reading a custom quark or the dark algorithm would see something else in
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
// suite turns order-dependent. The store starts from `preloadedState`, or from
// `{}`: never from localStorage, which a previous test may have written. Both
// are returned so a test can seed a session (`queryClient.setQueryData`),
// read client state (`store.getState()`), or remount on the same store.
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
            <MemoryRouter initialEntries={[route]}>
              {path ? (
                <Routes>
                  <Route path={path} element={children} />
                </Routes>
              ) : (
                children
              )}
            </MemoryRouter>
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
