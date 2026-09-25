import type { UserRole } from './role.ts';

// `as const` union rather than an enum, per the repository rules.
export const USER_STATUSES = ['active', 'blocked', 'pending'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// The password is absent by construction: it must never reach a response.
export interface PublicUser {
  id: number;
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  role: UserRole;
  // The same versioned-URL shape as a Book's Cover.
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// The longest term the Co-author picker's search accepts. The server refuses a
// longer `q` with a 400, so the client stops typing here instead of showing
// "No authors found" for a search that never ran.
export const AUTHOR_SEARCH_MAX_LENGTH = 64;

// PublicUser minus the email address. That single omission is what makes an
// author safe to embed in a public response: the email is the whole reason
// /api/users is guarded, so a shape without one carries nothing that guard
// exists to protect.
export interface AuthorSummary {
  id: number;
  login: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}
