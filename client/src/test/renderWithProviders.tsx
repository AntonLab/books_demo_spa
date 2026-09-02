import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import type { ReactElement, ReactNode } from 'react';
import type { RenderOptions, RenderResult } from '@testing-library/react';
import { createAppStore } from '../store';
import type { AppStore, RootState } from '../store';

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Partial<RootState>;
  store?: AppStore;
  route?: string;
}

// Every component test needs a store and a router. Returning the store lets a
// test assert on dispatched state without reaching for a second helper.
export function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions = {}
): RenderResult & { store: AppStore } {
  const {
    preloadedState,
    store = createAppStore(preloadedState),
    route = '/',
    ...renderOptions
  } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}
