import { AUTHOR_SEARCH_MAX_LENGTH, USER_ROLES, USER_STATUSES } from 'shared';
import { z } from 'zod';

// The response shapes and the status union are the client's contract too, so
// they live in the shared workspace (ADR-0006); the schemas stay here.
export {
  USER_STATUSES,
  type AuthorSummary,
  type PublicUser,
  type UserStatus,
} from 'shared';

// No `role` here, and none in updateUserSchema below, which is derived from
// this one with `.partial()` — a field added here appears there for free, and
// PATCH /api/users/:id would then let any signed-in caller promote themselves.
// The role travels as its own argument to the repository and through
// PATCH /api/users/:id/role, never through a body that also carries other
// fields.
export const createUserSchema = z.object({
  login: z.string().min(3).max(64),
  email: z.email().max(255),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(64),
  lastName: z.string().min(1).max(64),
  status: z.enum(USER_STATUSES).optional(),
});

export const updateUserSchema = createUserSchema
  .partial()
  .extend({
    // Proof of identity for changing your own password or email. Never
    // stored: the controller strips it before the repository sees the body.
    currentPassword: z.string().min(1).max(128).optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'currentPassword'),
    { message: 'At least one field must be provided' }
  );

export const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().min(1).max(64).optional(),
});

// The Co-author picker's search. No offset: a picker narrows by typing, not by
// paging, and a short cap keeps each keystroke's answer small.
export const listAuthorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().min(1).max(AUTHOR_SEARCH_MAX_LENGTH).optional(),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Its own schema, deliberately not part of updateUserSchema: the role travels
// through one door with its own guard, so it can never ride in alongside a
// name change.
export const updateRoleSchema = z.object({
  role: z.enum(USER_ROLES),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ListAuthorsQuery = z.infer<typeof listAuthorsQuerySchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

// What the repository applies: the body minus the proof that gated it.
export type UserChanges = Omit<UpdateUserInput, 'currentPassword'>;
