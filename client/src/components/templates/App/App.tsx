import { lazy, Suspense, useEffect } from 'react';
import type { FC } from 'react';
import { App as AntdApp, ConfigProvider, Layout, Spin, theme } from 'antd';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import { store } from '@/store';
import { queryClient } from '@/queries/queryClient';
import { useAppDispatch } from '@/store/hooks';
import { bootstrapSession } from '@/store/authSlice';
import { AppHeader } from '@/components/organisms/AppHeader';
import { AuthModals } from '@/components/organisms/AuthModals';
import { ErrorBoundary } from '@/components/organisms/ErrorBoundary';
import { appTheme } from '@/theme/tokens';

// Pages are the only code-split modules: AppHeader, AuthModals and the store
// render on every route, so splitting them would buy nothing. Each page is a
// named export, so `lazy` has to remap it onto `default` — see CLAUDE.md,
// "Page loading and errors".
const MainPage = lazy(() =>
  import('@/pages/MainPage').then((m) => ({ default: m.MainPage }))
);
const MyBooksPage = lazy(() =>
  import('@/pages/MyBooksPage').then((m) => ({ default: m.MyBooksPage }))
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage }))
);
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);
const ResetPasswordRoute = lazy(() =>
  import('@/pages/ResetPasswordRoute').then((m) => ({
    default: m.ResetPasswordRoute,
  }))
);
const SearchPage = lazy(() =>
  import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage }))
);
const SeriesPage = lazy(() =>
  import('@/pages/SeriesPage').then((m) => ({ default: m.SeriesPage }))
);

// Exported separately from `App` because `App` mounts BrowserRouter, which a
// test cannot point at an arbitrary path. Route tests wrap this in
// MemoryRouter instead.
export const AppShell: FC = () => {
  const { token } = theme.useToken();
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();

  useEffect(() => {
    // Asks "who am I?" once on mount. A 401 resolves to "anonymous" inside the
    // thunk, so no error surfaces for a first-time visitor.
    void dispatch(bootstrapSession());
  }, [dispatch]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppHeader />
      <Layout.Content style={{ padding: token.paddingLG }}>
        {/* One boundary and one fallback for every route, both inside the
            content area so the header and the auth modals survive a page
            that throws or a chunk still in flight. Keyed by pathname so a
            caught error clears on the next navigation. */}
        <ErrorBoundary key={pathname}>
          <Suspense
            fallback={
              <Spin
                size="large"
                style={{ display: 'block', margin: `${token.marginXXL}px 0` }}
              />
            }
          >
            <Routes>
              <Route path="/" element={<MainPage />} />
              <Route path="/reset-password" element={<ResetPasswordRoute />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/series" element={<SeriesPage />} />
              <Route path="/my-books" element={<MyBooksPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Layout.Content>
      <AuthModals />
    </Layout>
  );
};

export const App: FC = () => {
  return (
    // Outermost, though the order is not forced: nothing in the Redux tree
    // reads the query client through context and nothing in a query reads the
    // store. It matches renderWithProviders, where the nesting has to agree.
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        {/* antd's App must sit inside ConfigProvider to pick up its tokens and
            style reset. `appTheme` merges our quarks into antd's token set —
            see CLAUDE.md, Atomic Design, Quarks. */}
        <ConfigProvider theme={appTheme}>
          <AntdApp>
            <BrowserRouter>
              <AppShell />
            </BrowserRouter>
          </AntdApp>
        </ConfigProvider>
      </Provider>
    </QueryClientProvider>
  );
};
