import { z } from 'zod';

// `as const` union rather than an enum, per the repository rules.
export const USER_STATUSES = ['active', 'blocked', 'pending'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

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
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().min(1).max(64).optional(),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// The password is absent by construction: it must never reach a response.
export interface PublicUser {
  id: number;
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}
