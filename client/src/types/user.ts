import type * as Shared from 'shared';
import type { Wire } from 'shared';

// The server's own unions, from the shared workspace (ADR-0006). `guest` is
// absent from the roles: it is what the server assumes for a caller with no
// session, never a value a row carries.
export {
  REGISTRABLE_ROLES,
  USER_ROLES,
  USER_STATUSES,
  type RegistrableRole,
  type UserRole,
  type UserStatus,
} from 'shared';

// The shared shapes are the server's, with `Date` fields. Wire<> turns those
// into the ISO strings they cross the wire as: using the server type directly
// would typecheck and then throw on `.getFullYear()`.
export type PublicUser = Wire<Shared.PublicUser>;

// The email-free author shape the public endpoints embed. The omission is what
// makes it safe to return without a session — the email is the whole reason
// /api/users is guarded, so the client can never look an author up itself.
export type AuthorSummary = Wire<Shared.AuthorSummary>;
