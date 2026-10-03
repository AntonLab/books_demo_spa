import { ApiError } from '@/api/client';
import { accountFieldErrors } from './accountErrors';

describe('accountFieldErrors', () => {
  it('maps a 409 on login and on email to the field with a friendly text', () => {
    expect(
      accountFieldErrors(
        new ApiError(409, 'login is already taken', { field: 'login' })
      )
    ).toEqual([{ name: 'login', errors: ['This login is already taken.'] }]);
    expect(
      accountFieldErrors(
        new ApiError(409, 'email is already taken', { field: 'email' })
      )
    ).toEqual([{ name: 'email', errors: ['This email is already taken.'] }]);
  });

  it('maps the wrong current password to the currentPassword field', () => {
    expect(
      accountFieldErrors(new ApiError(403, 'Current password is incorrect'))
    ).toEqual([
      { name: 'currentPassword', errors: ['Current password is incorrect'] },
    ]);
  });

  it('maps 400 zod issues to their first path segment', () => {
    const issues = [{ path: ['firstName'], message: 'Too big' }];
    expect(
      accountFieldErrors(new ApiError(400, 'Request validation failed', issues))
    ).toEqual([{ name: 'firstName', errors: ['Too big'] }]);
  });

  it('returns null for anything else', () => {
    expect(
      accountFieldErrors(
        new ApiError(403, 'You may not change your own status')
      )
    ).toBeNull();
    expect(
      accountFieldErrors(
        new ApiError(
          400,
          'currentPassword is required to change your password or email'
        )
      )
    ).toBeNull();
    expect(
      accountFieldErrors(new ApiError(409, 'x', { field: 'other' }))
    ).toBeNull();
    expect(
      accountFieldErrors(
        new ApiError(400, 'Request validation failed', [
          { path: [], message: 'm' },
        ])
      )
    ).toBeNull();
    expect(accountFieldErrors(new Error('boom'))).toBeNull();
  });
});
