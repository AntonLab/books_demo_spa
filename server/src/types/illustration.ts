import {
  ILLUSTRATION_CAPTION_MAX_LENGTH,
  ILLUSTRATIONS_PER_CHAPTER_MAX,
} from 'shared';
import { z } from 'zod';
import { idSchema } from './params.ts';

// A blank caption clears it, like null.
export const updateIllustrationSchema = z
  .object({
    caption: z
      .string()
      .trim()
      .max(ILLUSTRATION_CAPTION_MAX_LENGTH)
      .transform((caption) => caption || null)
      .nullable(),
  })
  .strict();

// A chapter's whole Illustration order, first first: the whole list, so the
// repository can tell when it was drawn from a set that has since changed.
export const reorderIllustrationsSchema = z.object({
  illustrationIds: z
    .array(idSchema)
    .min(1)
    .max(ILLUSTRATIONS_PER_CHAPTER_MAX)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Each illustration may appear only once',
    }),
});

export type UpdateIllustrationInput = z.infer<typeof updateIllustrationSchema>;
export type ReorderIllustrationsInput = z.infer<
  typeof reorderIllustrationsSchema
>;
