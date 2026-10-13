import {
  LOGIN_FORBIDDEN_CHARACTER,
  LOGIN_FORBIDDEN_CHARACTER_MESSAGE,
  LOGIN_MAX_LENGTH,
  LOGIN_MIN_LENGTH,
} from 'shared';
import { z } from 'zod';

// One login rule for every body that creates or changes a login. Not
// `loginSchema`: that is the sign-in body in ./auth.ts, which is unbounded.
export const loginFieldSchema = z
  .string()
  .min(LOGIN_MIN_LENGTH)
  .max(LOGIN_MAX_LENGTH)
  .refine((value) => !value.includes(LOGIN_FORBIDDEN_CHARACTER), {
    message: LOGIN_FORBIDDEN_CHARACTER_MESSAGE,
  });
