import {
  ACTIONS,
  MODULES,
  ROLES,
  type Action,
  type Module,
  type PermissionScope,
  type PublicPermission,
  type Role,
} from '../types/permission.ts';

type ModuleGrants = Partial<Record<Action, PermissionScope>>;
type RoleGrants = Partial<Record<Module, ModuleGrants>>;

// Only what is granted is spelled out; everything omitted expands to `none`.
// Writing 140 rows by hand would bury the five decisions that actually matter
// under a wall of denials.
//
// On `create`: a created row is the caller's by construction — its userId
// comes from the session — so `own` and `any` mean the same thing there, and
// `own` is the spelling a role that may create uses. The create path is not
// scope-only, though: creating a book into a series checks that the caller
// may touch that series (assertMayAddToSeries in controllers/bookController.ts),
// and creating a chapter checks the owner of its book (assertMayAddTo in
// controllers/chapterController.ts).
const PUBLIC_READS: RoleGrants = {
  series: { read: 'any' },
  books: { read: 'any' },
  chapters: { read: 'any' },
  comments: { read: 'any' },
  likes: { read: 'any' },
};

const USER_GRANTS: RoleGrants = {
  ...PUBLIC_READS,
  // Guarded but unrestricted, as it is today: any signed-in caller may read the
  // directory, and may edit only their own row.
  users: { read: 'any', update: 'own', delete: 'own' },
  comments: { read: 'any', create: 'own', update: 'own', delete: 'own' },
  // update is what turns a like into a dislike; without it likeRoutes' PATCH
  // would be reachable by superadmin alone.
  likes: { read: 'any', create: 'own', update: 'own', delete: 'own' },
};

const AUTHOR_GRANTS: RoleGrants = {
  ...USER_GRANTS,
  series: { read: 'any', create: 'own', update: 'own', delete: 'own' },
  books: { read: 'any', create: 'own', update: 'own', delete: 'own' },
  chapters: { read: 'any', create: 'own', update: 'own', delete: 'own' },
};

const ADMIN_GRANTS: RoleGrants = {
  ...USER_GRANTS,
  users: { read: 'any', update: 'any', delete: 'any' },
  // create stays absent — and therefore `none`. Admins moderate; they do not
  // author. This is the one place the roles stop accumulating.
  series: { read: 'any', update: 'any', delete: 'any' },
  books: { read: 'any', update: 'any', delete: 'any' },
  chapters: { read: 'any', update: 'any', delete: 'any' },
  // Moderators remove and restore other people's comments; they never rewrite
  // them. `update: own` still lets an admin edit what they wrote themselves,
  // and it is what makes "restore, then edit" impossible. Restoring rides on
  // `delete: any` — see commentController.restore.
  comments: { read: 'any', create: 'own', update: 'own', delete: 'any' },
  // The same rule for likes: a moderator may delete a reported like but not
  // flip someone's like into a dislike. create stays `own` — an admin may
  // still like things as themselves.
  likes: { read: 'any', create: 'own', update: 'own', delete: 'any' },
  reports: { read: 'any', create: 'any', update: 'any', delete: 'any' },
};

// `any` on everything, with the two carve-outs admin has too: no creating
// content (admins moderate; they do not author) and no rewriting another
// account's comments or likes (moderators remove; they do not rewrite).
function superadminScope(module: Module, action: Action): PermissionScope {
  if (
    action === 'create' &&
    (module === 'books' || module === 'series' || module === 'chapters')
  ) {
    return 'none';
  }
  if (action === 'update' && (module === 'comments' || module === 'likes')) {
    return 'own';
  }
  return 'any';
}

const SUPERADMIN_GRANTS: RoleGrants = Object.fromEntries(
  MODULES.map((module): [Module, ModuleGrants] => [
    module,
    Object.fromEntries(
      ACTIONS.map((action): [Action, PermissionScope] => [
        action,
        superadminScope(module, action),
      ])
    ),
  ])
);

export const PERMISSION_DEFINITION: Record<Role, RoleGrants> = {
  guest: PUBLIC_READS,
  user: USER_GRANTS,
  author: AUTHOR_GRANTS,
  admin: ADMIN_GRANTS,
  superadmin: SUPERADMIN_GRANTS,
};

// Expands the sparse definition into one row per role/module/action. The dense
// form is what the table stores, so a missing row can never be mistaken for a
// missing grant.
export function buildMatrixRows(): PublicPermission[] {
  const rows: PublicPermission[] = [];

  for (const role of ROLES) {
    for (const module of MODULES) {
      for (const action of ACTIONS) {
        rows.push({
          role,
          module,
          action: action,
          scope: PERMISSION_DEFINITION[role][module]?.[action] ?? 'none',
        });
      }
    }
  }

  return rows;
}
