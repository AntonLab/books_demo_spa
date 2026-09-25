import { z } from 'zod';
import { REGISTRABLE_ROLES } from 'shared';

// The field rules match createUserSchema in ./user.ts, minus `status`: a
// registrant does not get to choose their own account state, so the key is
// absent here and set by the controller.
export const registerSchema = z.object({
  login: z.string().min(3).max(64),
  email: z.email().max(255),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(64),
  lastName: z.string().min(1).max(64),
  // The only place a role is accepted from a public body, and it is narrowed to
  // the two that are a statement of intent rather than a privilege. admin and
  // superadmin are unreachable here by construction — see types/user.ts for
  // why the general user schemas carry no role at all.
  role: z.enum(REGISTRABLE_ROLES).default('user'),
});

// Deliberately unbounded on password, unlike registerSchema. Length rules here
// would reject a credential that is already stored and valid, turning a policy
// change into a lockout — and a rejection shape that differs by password
// length would leak information the 401 is careful not to give.
export const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export const resetRequestSchema = z.object({
  email: z.email().max(255),
});

export const resetConfirmSchema = z.object({
  token: z.string().min(1).max(255),
  password: z.string().min(8).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type ResetConfirmInput = z.infer<typeof resetConfirmSchema>;
