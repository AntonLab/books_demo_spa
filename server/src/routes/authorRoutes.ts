import { Router } from 'express';
import { createRequirePermission } from '../middleware/requirePermission.ts';
import { validate, validatedQuery } from '../middleware/validate.ts';
import {
  listAuthorsQuerySchema,
  type ListAuthorsQuery,
} from '../types/user.ts';
import type { RouteDeps } from './index.ts';

// The Co-author picker's search: accounts holding the `author` Role, as
// AuthorSummary. Its own route rather than a flag on /api/users, because that
// one answers with PublicUser, email and all; this shape carries none, and
// keeping the two apart means neither can grow into the other by accident.
export function createAuthorRoutes(deps: RouteDeps): Router {
  const requirePermission = createRequirePermission(deps);
  const router = Router();

  // `users × read`, as the directory is: any signed-in caller, never a guest.
  // A byline already names an author publicly, but an author with no book yet
  // is named nowhere, and a guest has no book to credit anyone on.
  router.get(
    '/',
    requirePermission('users', 'read'),
    validate({ query: listAuthorsQuerySchema }),
    async (req, res) => {
      const query = validatedQuery<ListAuthorsQuery>(req);
      const items = await deps.userRepository.listAuthors(query);
      res.json({ items });
    }
  );

  return router;
}
