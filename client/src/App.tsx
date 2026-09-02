import { useEffect } from 'react';
import { App as AntdApp, ConfigProvider, Layout } from 'antd';
import { Provider } from 'react-redux';
import { BrowserRouter, Route, Routes } from 'react-router';
import { store } from './store';
import { useAppDispatch } from './store/hooks';
import { bootstrapSession } from './store/authSlice';
import { MainPage } from './pages/MainPage';
import { MyBooksPage } from './pages/MyBooksPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProfilePage } from './pages/ProfilePage';
import { SeriesPage } from './pages/SeriesPage';

// Exported separately from `App` because `App` mounts BrowserRouter, which a
// test cannot point at an arbitrary path. Route tests wrap this in
// MemoryRouter instead.
export function AppShell() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Asks "who am I?" once on mount. A 401 resolves to "anonymous" inside the
    // thunk, so no error surfaces for a first-time visitor.
    void dispatch(bootstrapSession());
  }, [dispatch]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Content style={{ padding: 24 }}>
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/series" element={<SeriesPage />} />
          <Route path="/my-books" element={<MyBooksPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout.Content>
    </Layout>
  );
}

function App() {
  return (
    <Provider store={store}>
      {/* antd's App must sit inside ConfigProvider to pick up its tokens and
          style reset. */}
      <ConfigProvider>
        <AntdApp>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </AntdApp>
      </ConfigProvider>
    </Provider>
  );
}

export default App;
