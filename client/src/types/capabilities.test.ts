import type { BookStatus } from './book';
import { bookCapabilities, seriesCapabilities } from './capabilities';
import type { PublicUser } from './user';

const account = (id: number, role: PublicUser['role']): PublicUser => ({
  id,
  login: `account${id}`,
  email: `account${id}@example.com`,
  firstName: 'Test',
  lastName: 'Account',
  role,
  status: 'active',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const COAUTHOR = account(1, 'author');
const STRANGER = account(2, 'author');
const ADMIN = account(3, 'admin');
const SUPERADMIN = account(4, 'superadmin');

const book = (status: BookStatus) => ({ status, authors: [{ id: 1 }] });

describe('bookCapabilities', () => {
  it.each([
    // viewer, status, isCoAuthor, mayEdit, mayLike, mayRead
    ['a Guest', null, 'complete', false, false, false, true],
    ['a Guest', null, 'draft', false, false, false, false],
    ['a Co-author', COAUTHOR, 'complete', true, true, false, true],
    ['a Co-author', COAUTHOR, 'draft', true, true, false, true],
    ['a stranger', STRANGER, 'in_progress', false, false, true, true],
    ['a stranger', STRANGER, 'draft', false, false, false, false],
    ['an admin', ADMIN, 'complete', false, true, true, true],
    ['an admin', ADMIN, 'draft', false, true, false, true],
    ['a superadmin', SUPERADMIN, 'draft', false, true, false, true],
  ] as const)(
    '%s on a %s book',
    (_name, session, status, isCoAuthor, mayEdit, mayLike, mayRead) => {
      expect(bookCapabilities(book(status), session)).toEqual({
        isCoAuthor,
        mayEdit,
        mayLike,
        mayRead,
      });
    }
  );

  it('treats a session still loading as a Guest', () => {
    expect(bookCapabilities(book('complete'), undefined).mayLike).toBe(false);
  });
});

describe('seriesCapabilities', () => {
  const series = { authors: [{ id: 1 }] };

  it.each([
    ['a Guest', null, false, false],
    ['a Co-author', COAUTHOR, true, true],
    ['a stranger', STRANGER, false, false],
    ['an admin', ADMIN, false, true],
  ] as const)('%s', (_name, session, isCoAuthor, mayEdit) => {
    expect(seriesCapabilities(series, session)).toEqual({
      isCoAuthor,
      mayEdit,
    });
  });
});
