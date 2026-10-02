import { z } from 'zod';
import {
  EMAIL_MAX_LENGTH,
  LOGIN_MAX_LENGTH,
  LOGIN_MIN_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REGISTRABLE_ROLES,
} from 'shared';

// The field rules match createUserSchema in ./user.ts, minus `status`: a
// registrant does not get to choose their own account state, so the key is
// absent here and set by the controller.
export const registerSchema = z.object({
  login: z.string().min(LOGIN_MIN_LENGTH).max(LOGIN_MAX_LENGTH),
  email: z.email().max(EMAIL_MAX_LENGTH),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  firstName: z.string().min(1).max(NAME_MAX_LENGTH),
  lastName: z.string().min(1).max(NAME_MAX_LENGTH),
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
  email: z.email().max(EMAIL_MAX_LENGTH),
});

export const resetConfirmSchema = z.object({
  token: z.string().min(1).max(255),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type ResetConfirmInput = z.infer<typeof resetConfirmSchema>;
