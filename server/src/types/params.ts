import { z } from 'zod';

// One id rule for the whole API, whether the id arrives in the path, the query
// or the body: every table's key is an auto-increment integer, so a resource
// with a different key shape is the case that gets its own schema.
export const idSchema = z.coerce.number().int().positive();

export const idParamSchema = z.object({
  id: idSchema,
});

// Books and series take co-authors the same way — a Co-author is one role on
// either (ADR-0005).
export const addCoAuthorSchema = z.object({
  userId: idSchema,
});

export const coAuthorParamSchema = z.object({
  id: idSchema,
  userId: idSchema,
});

export type AddCoAuthorInput = z.infer<typeof addCoAuthorSchema>;
