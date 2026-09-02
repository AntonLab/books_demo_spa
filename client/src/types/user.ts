export const USER_STATUSES = ['active', 'blocked', 'pending'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

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
  createdAt: string;
  updatedAt: string;
}
