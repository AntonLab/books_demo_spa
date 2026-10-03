import { lazy, Suspense } from 'react';
import type { FC } from 'react';
import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntdApp, Layout } from 'antd';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Provider } from 'react-redux';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router';
import { PASSWORD_RESET_PATH } from 'shared';
import { queryClient } from '@/queries/queryClient';
import { store } from '@/store';
import { useUnsavedTextAccountBinding } from '@/store/useUnsavedText';
import { GoneRedirect } from '@/components/molecules/GoneRedirect/GoneRedirect';
import { PageSpinner } from '@/components/molecules/PageSpinner/PageSpinner';
import { AppHeader } from '@/components/organisms/AppHeader/AppHeader';
import { ErrorBoundary } from '@/components/organisms/ErrorBoundary/ErrorBoundary';
import { ThemedConfigProvider } from '@/components/organisms/ThemedConfigProvider/ThemedConfigProvider';
import styles from './App.module.css';

// Pages are the only code-split modules: AppHeader and the auth modals it holds
// render on every route, so splitting them would buy nothing. Each page is a
// named export, so `lazy` has to remap it onto `default` — see
// .claude/rules/client/pages.md.
const AdminGenresPage = lazy(() =>
  import('@/pages/AdminGenresPage/AdminGenresPage').then((m) => ({
    default: m.AdminGenresPage,
  }))
);
const BookPage = lazy(() =>
  import('@/pages/BookPage/BookPage').then((m) => ({ default: m.BookPage }))
);
const ChapterPage = lazy(() =>
  import('@/pages/ChapterPage/ChapterPage').then((m) => ({
    default: m.ChapterPage,
  }))
);
const MainPage = lazy(() =>
  import('@/pages/MainPage/MainPage').then((m) => ({ default: m.MainPage }))
);
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage/ProfilePage').then((m) => ({
    default: m.ProfilePage,
  }))
);
const SearchPage = lazy(() =>
  import('@/pages/SearchPage/SearchPage').then((m) => ({
    default: m.SearchPage,
  }))
);
const ReadingListPage = lazy(() =>
  import('@/pages/ReadingListPage/ReadingListPage').then((m) => ({
    default: m.ReadingListPage,
  }))
);
const SeriesPage = lazy(() =>
  import('@/pages/SeriesPage/SeriesPage').then((m) => ({
    default: m.SeriesPage,
  }))
);

const BookRedirect: FC = () => {
  const { bookId } = useParams();
  return <Navigate to={`/books/${bookId}`} replace />;
};

// Exported separately from `App` because `App` mounts BrowserRouter, which a
// test cannot point at an arbitrary path. Route tests wrap this in
// MemoryRouter instead.
export const AppShell: FC = () => {
  const { pathname } = useLocation();
  useUnsavedTextAccountBinding();
  // The Profile routes all render ProfilePage and only switch its outer Tabs;
  // keying the boundary by the bare pathname would remount it, and every antd
  // pane it has mounted, on each tab click. They share one key instead.
  const isProfile = pathname === '/profile' || pathname.startsWith('/profile/');
  const boundaryKey = isProfile ? '/profile' : pathname;

  return (
    <Layout className={styles.layout}>
      <AppHeader />
      <Layout.Content className={styles.content}>
        {/* One boundary and one fallback for every route, both inside the
            content area so the header and the auth modals survive a page
            that throws or a chunk still in flight. Keyed by pathname so a
            caught error clears on the next navigation. */}
        <ErrorBoundary key={boundaryKey}>
          <Suspense fallback={<PageSpinner />}>
            <Routes>
              <Route path="/" element={<MainPage />} />
              {/* The emailed reset link lands here; AuthModals reads its
                  token and opens the confirm modal over the home page. */}
              <Route path={PASSWORD_RESET_PATH} element={<MainPage />} />
              <Route path="/books/:id" element={<BookPage />} />
              <Route
                path="/books/:bookId/chapters/:chapterId"
                element={<ChapterPage />}
              />
              {/* The static `new` segment outranks `:chapterId`. The old
                  Chapter pages are gone, and a bookmark lands on the Book. */}
              <Route
                path="/books/:bookId/chapters/new"
                element={<BookRedirect />}
              />
              <Route
                path="/books/:bookId/chapters/:chapterId/edit"
                element={<BookRedirect />}
              />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/series/:id" element={<SeriesPage />} />
              <Route path="/lists/:id" element={<ReadingListPage />} />
              {/* One page whose tabs are paths; see ProfilePage. */}
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/favorites" element={<ProfilePage />} />
              <Route path="/profile/library" element={<ProfilePage />} />
              <Route path="/profile/lists" element={<ProfilePage />} />
              <Route path="/profile/my-books" element={<ProfilePage />} />
              {/* The paths these tabs had as pages of their own. */}
              <Route
                path="/favorites"
                element={<Navigate replace to="/profile/favorites" />}
              />
              <Route
                path="/my-books"
                element={<Navigate replace to="/profile/my-books" />}
              />
              <Route path="/admin/genres" element={<AdminGenresPage />} />
              <Route
                path="*"
                element={<GoneRedirect message="Page not found." />}
              />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Layout.Content>
      <Layout.Footer className={styles.footer}>
        <span>© 2026 Books Demo</span>
        <Link to="/search">Search</Link>
      </Layout.Footer>
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
        {/* `layer` puts antd's styles in `@layer antd`, so a component's
            `.module.css` outranks them without a specificity contest —
            antd's Typography selectors (`div.ant-typography`) would beat a
            lone class otherwise. See docs/adr/0009-css-modules-over-inline-styles.md. */}
        <StyleProvider layer>
          {/* antd's App must sit inside the ConfigProvider to pick up its
              tokens and style reset. ThemedConfigProvider merges our quarks
              into antd's token set and picks the device's light or dark
              algorithm — see .claude/rules/client/styling.md. */}
          <ThemedConfigProvider>
            <AntdApp>
              <BrowserRouter>
                <AppShell />
              </BrowserRouter>
            </AntdApp>
          </ThemedConfigProvider>
        </StyleProvider>
      </Provider>
      <ReactQueryDevtools />
    </QueryClientProvider>
  );
};
