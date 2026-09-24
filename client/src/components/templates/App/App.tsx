import { lazy, Suspense } from 'react';
import type { FC } from 'react';
import { StyleProvider } from '@ant-design/cssinjs';
import { App as AntdApp, Layout, Spin } from 'antd';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Provider } from 'react-redux';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import { queryClient } from '@/queries/queryClient';
import { store } from '@/store';
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
const EditChapterPage = lazy(() =>
  import('@/pages/EditChapterPage/EditChapterPage').then((m) => ({
    default: m.EditChapterPage,
  }))
);
const EditSeriesPage = lazy(() =>
  import('@/pages/EditSeriesPage/EditSeriesPage').then((m) => ({
    default: m.EditSeriesPage,
  }))
);
const EditBookPage = lazy(() =>
  import('@/pages/EditBookPage/EditBookPage').then((m) => ({
    default: m.EditBookPage,
  }))
);
const MainPage = lazy(() =>
  import('@/pages/MainPage/MainPage').then((m) => ({ default: m.MainPage }))
);
const MyBooksPage = lazy(() =>
  import('@/pages/MyBooksPage/MyBooksPage').then((m) => ({
    default: m.MyBooksPage,
  }))
);
const NewBookPage = lazy(() =>
  import('@/pages/NewBookPage/NewBookPage').then((m) => ({
    default: m.NewBookPage,
  }))
);
const NewChapterPage = lazy(() =>
  import('@/pages/NewChapterPage/NewChapterPage').then((m) => ({
    default: m.NewChapterPage,
  }))
);
const NewSeriesPage = lazy(() =>
  import('@/pages/NewSeriesPage/NewSeriesPage').then((m) => ({
    default: m.NewSeriesPage,
  }))
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage/NotFoundPage').then((m) => ({
    default: m.NotFoundPage,
  }))
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

// Exported separately from `App` because `App` mounts BrowserRouter, which a
// test cannot point at an arbitrary path. Route tests wrap this in
// MemoryRouter instead.
export const AppShell: FC = () => {
  const { pathname } = useLocation();

  return (
    <Layout className={styles.layout}>
      <AppHeader />
      <Layout.Content className={styles.content}>
        {/* One boundary and one fallback for every route, both inside the
            content area so the header and the auth modals survive a page
            that throws or a chunk still in flight. Keyed by pathname so a
            caught error clears on the next navigation. */}
        <ErrorBoundary key={pathname}>
          <Suspense
            fallback={<Spin size="large" className={styles.fallback} />}
          >
            <Routes>
              <Route path="/" element={<MainPage />} />
              {/* The emailed reset link lands here; AuthModals reads its
                  token and opens the confirm modal over the home page. */}
              <Route path="/reset-password" element={<MainPage />} />
              {/* A static segment outranks `:id`, so /books/new never reaches
                  BookPage whatever order these are declared in. */}
              <Route path="/books/new" element={<NewBookPage />} />
              <Route path="/books/:id" element={<BookPage />} />
              <Route path="/books/:id/edit" element={<EditBookPage />} />
              <Route
                path="/books/:bookId/chapters/:chapterId"
                element={<ChapterPage />}
              />
              {/* The static `new` segment outranks `:chapterId`, as
                  /books/new does `:id` above. */}
              <Route
                path="/books/:bookId/chapters/new"
                element={<NewChapterPage />}
              />
              <Route
                path="/books/:bookId/chapters/:chapterId/edit"
                element={<EditChapterPage />}
              />
              <Route path="/search" element={<SearchPage />} />
              {/* The public series page is still a stub; only authoring is built. */}
              <Route path="/series/new" element={<NewSeriesPage />} />
              <Route path="/series/:id/edit" element={<EditSeriesPage />} />
              <Route path="/my-books" element={<MyBooksPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/admin/genres" element={<AdminGenresPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Layout.Content>
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
