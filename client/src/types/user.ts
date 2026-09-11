export const USER_STATUSES = ['active', 'blocked', 'pending'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// Mirrors USER_ROLES on the server. `guest` is absent here too: it is what the
// server assumes for a caller with no session, never a value a row carries.
export const USER_ROLES = ['user', 'author', 'admin', 'superadmin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// `createdAt`/`updatedAt` are `string`, not `Date`: the server types them as
// `Date` in process, but they cross the wire as ISO strings. Copying the
// server interface would typecheck and then throw on `.getFullYear()`.
export interface PublicUser {
  id: number;
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

// The email-free author shape the public endpoints embed. The omission is what
// makes it safe to return without a session — the email is the whole reason
// /api/users is guarded, so the client can never look an author up itself.
export interface AuthorSummary {
  id: number;
  login: string;
  firstName: string;
  lastName: string;
}
