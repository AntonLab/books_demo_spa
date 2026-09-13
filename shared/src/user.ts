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
  createdAt: Date;
  updatedAt: Date;
}

// PublicUser minus the email address. That single omission is what makes an
// author safe to embed in a public response: the email is the whole reason
// /api/users is guarded, so a shape without one carries nothing that guard
// exists to protect.
export interface AuthorSummary {
  id: number;
  login: string;
  firstName: string;
  lastName: string;
}
