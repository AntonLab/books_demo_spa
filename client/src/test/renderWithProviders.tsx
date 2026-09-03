import { render } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import type { ReactElement, ReactNode } from 'react';
import type { RenderOptions, RenderResult } from '@testing-library/react';
import { createAppStore } from '../store';
import { appTheme } from '../theme/tokens';
import type { AppStore, RootState } from '../store';

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Partial<RootState>;
  store?: AppStore;
  route?: string;
}

// Every component test needs a store, a router and the app's tokens.
// ConfigProvider is here because App.tsx mounts it in production: without it a
// component reading a custom quark would get `undefined` in tests only, and
// that divergence would be invisible. Returning the store lets a test assert
// on dispatched state without reaching for a second helper.
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

  const Wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <Provider store={store}>
        <ConfigProvider theme={appTheme}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </ConfigProvider>
      </Provider>
    );
  };

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}
