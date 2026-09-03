import { render, screen } from '@testing-library/react';
import App, { AppShell } from './App';
import { renderWithProviders } from './test/renderWithProviders';
import * as authApi from './api/auth';
import * as booksApi from './api/books';
import { ApiError } from './api/client';

jest.mock('./api/auth');
jest.mock('./api/books');

const mockedAuth = jest.mocked(authApi);
const mockedBooks = jest.mocked(booksApi);

beforeEach(() => {
  jest.resetAllMocks();
  // Anonymous visitor unless a test says otherwise.
  mockedAuth.me.mockRejectedValue(new ApiError(401, 'Authentication required'));
  // MainPage fetches books from Task 10 onward; a real envelope keeps these
  // routing tests from tripping over an incidental fetch failure.
  mockedBooks.listBooks.mockResolvedValue({
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
  });
});

describe('AppShell routing', () => {
  it('renders MainPage at /', async () => {
    renderWithProviders(<AppShell />, { route: '/' });

    expect(
      await screen.findByRole('heading', { name: /books/i })
    ).toBeInTheDocument();
  });

  it('renders the series stub at /series', async () => {
    renderWithProviders(<AppShell />, { route: '/series' });

    expect(
      await screen.findByRole('heading', { name: 'Series' })
    ).toBeInTheDocument();
  });

  it('renders the my-books stub at /my-books', async () => {
    renderWithProviders(<AppShell />, { route: '/my-books' });

    expect(
      await screen.findByRole('heading', { name: 'My Books' })
    ).toBeInTheDocument();
  });

  it('renders the profile stub at /profile', async () => {
    renderWithProviders(<AppShell />, { route: '/profile' });

    expect(
      await screen.findByRole('heading', { name: 'Profile' })
    ).toBeInTheDocument();
  });

  it('renders the not-found page for an unknown route', async () => {
    renderWithProviders(<AppShell />, { route: '/nowhere' });

    expect(
      await screen.findByRole('heading', { name: 'Page not found' })
    ).toBeInTheDocument();
  });
});

describe('AppShell session bootstrap', () => {
  it('asks the server who is logged in on mount', async () => {
    renderWithProviders(<AppShell />);

    await screen.findByRole('heading', { name: /books/i });
    expect(mockedAuth.me).toHaveBeenCalledTimes(1);
  });

  it('settles to ready with no user when the visitor is anonymous', async () => {
    const { store } = renderWithProviders(<AppShell />);

    await screen.findByRole('heading', { name: /books/i });

    const { auth } = store.getState();
    expect(auth.status).toBe('ready');
    expect(auth.user).toBeNull();
    expect(auth.error).toBeNull();
  });
});

describe('App', () => {
  // The composition root: Provider > ConfigProvider > AntdApp > BrowserRouter
  // > AppShell, mounted for real rather than swapped for MemoryRouter and a
  // fresh store the way every other suite in this file does. BrowserRouter
  // reads the jsdom URL, which defaults to http://localhost/, so this
  // exercises MainPage the same way the "renders MainPage at /" case above
  // does — just through the real tree instead of AppShell in isolation.
  it('renders the real composition root at /', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /books/i })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Log in' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Search books')).toBeInTheDocument();
  });
});
