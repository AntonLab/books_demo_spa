import { screen } from '@testing-library/react';
import { ResetPasswordRoute } from './ResetPasswordRoute';
import { renderWithProviders } from '../test/renderWithProviders';
import * as booksApi from '../api/books';

jest.mock('../api/books');

// ResetPasswordRoute renders MainPage, which fetches books from Task 10
// onward. Give the mock a real envelope so this suite exercises the reset
// wiring rather than an incidental fetch failure.
beforeEach(() => {
  jest.mocked(booksApi).listBooks.mockResolvedValue({
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
  });
});

describe('ResetPasswordRoute', () => {
  it('opens the confirm modal with the token from the query string', async () => {
    const { store } = renderWithProviders(<ResetPasswordRoute />, {
      route: '/reset-password?token=tok-123',
    });

    await screen.findByRole('heading', { name: /books/i });

    expect(store.getState().auth).toMatchObject({
      activeModal: 'resetConfirm',
      resetToken: 'tok-123',
    });
  });

  it('leaves the modals alone when the link has no token', async () => {
    const { store } = renderWithProviders(<ResetPasswordRoute />, {
      route: '/reset-password',
    });

    await screen.findByRole('heading', { name: /books/i });

    expect(store.getState().auth.activeModal).toBeNull();
  });
});
