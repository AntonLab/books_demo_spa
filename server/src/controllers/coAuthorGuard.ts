import type { Request } from 'express';
import { scopeFor } from '../permissions/permissionStore.ts';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../types/errors.ts';

// The other half of enforcement for Books, Series and Chapters.
// requirePermission already refused `none`; `own` has to look at the row —
// which is why this cannot live in the middleware, where the row is not
// loaded yet.
//
// `own` means "one of the work's Co-authors": a work has no single owner, and
// every Co-author holds the same rights over it (ADR-0005).
//
// Every check resolves the row first, under every scope, so a missing one is
// 404 before 403 (a refusal cannot be used to probe which ids exist) and
// before a handler spends work on the body.

export interface CoAuthorTarget {
  // What a missing row is reported as.
  resource: 'Book' | 'Series' | 'Chapter';
  id: number;
  // The Co-authors answering for the row, or null when it does not exist.
  coAuthorIds: () => Promise<number[] | null>;
}

async function coAuthorsOf(target: CoAuthorTarget): Promise<number[]> {
  const coAuthorIds = await target.coAuthorIds();
  if (coAuthorIds === null) {
    throw new NotFoundError(target.resource, target.id);
  }
  return coAuthorIds;
}

function refuseUncredited(
  req: Request,
  coAuthorIds: number[],
  refusal: string
): void {
  if (req.user === undefined || !coAuthorIds.includes(req.user.id)) {
    throw new ForbiddenError(refusal);
  }
}

// Editing a work, its chapters or its order: a Co-author, or a Moderator
// under `any`. Only `any` skips the comparison. Every other value, a missing
// scope included, falls through to it, so a handler mounted without
// requirePermission fails closed rather than acting as `any`.
export async function assertMayChange(
  req: Request,
  target: CoAuthorTarget,
  refusal: string
): Promise<void> {
  const coAuthorIds = await coAuthorsOf(target);
  if (req.permissionScope === 'any') return;
  refuseUncredited(req, coAuthorIds, refusal);
}

// The byline: a Co-author only, whatever the scope. A Moderator may edit a
// work but never change who wrote it.
export async function assertCoAuthor(
  req: Request,
  target: CoAuthorTarget,
  refusal: string
): Promise<void> {
  refuseUncredited(req, await coAuthorsOf(target), refusal);
}

// Taking a credit off a work. The route sits behind requireAuth alone, so a
// Co-author who switched Role to `user` (`none` on the module) can still
// leave; that is why the matrix is read here rather than stamped by
// requirePermission. Leaving needs no check: the repository answers 404 for
// an uncredited account and 409 for the last Co-author. Removing someone else
// takes exactly `own` — `none` is no longer an author and `any` is a
// Moderator, who never changes a byline (ADR-0005) — and a credit.
export async function assertMayRemoveCredit(
  req: Request,
  target: CoAuthorTarget,
  module: 'books' | 'series',
  userId: number,
  refusal: string
): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  if (userId === req.user.id) return;
  if (scopeFor(req.user.role, module, 'update') !== 'own') {
    throw new ForbiddenError('Only a co-author may remove a co-author');
  }
  await assertCoAuthor(req, target, refusal);
}
