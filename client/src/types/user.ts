import type * as Shared from 'shared';
import type { Wire } from 'shared';

// The roles the public sign-up form may pick, and who counts as a Moderator,
// from the shared workspace (ADR-0006).
export { isModeratorRole, type RegistrableRole } from 'shared';

// The shared shapes are the server's, with `Date` fields. Wire<> turns those
// into the ISO strings they cross the wire as: using the server type directly
// would typecheck and then throw on `.getFullYear()`.
export type PublicUser = Wire<Shared.PublicUser>;

// The email-free author shape the public endpoints embed. The omission is what
// makes it safe to return without a session — the email is the whole reason
// /api/users is guarded, so the client can never look an author up itself.
export type AuthorSummary = Wire<Shared.AuthorSummary>;

// Whether the account is one of a book's or series' Co-authors. No work or no
// account (a Guest) is no.
export const isCreditedTo = (
  work: { authors: readonly { id: number }[] } | undefined,
  userId: number | undefined
): boolean => work?.authors.some((author) => author.id === userId) ?? false;
