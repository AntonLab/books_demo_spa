import type { RequestHandler } from 'express';
import type { ItemsResponse, PublicIllustration } from 'shared';
import { validatedParams } from '../middleware/validate.ts';
import type { IllustrationRepository } from '../repositories/illustrationRepository.ts';
import { viewerOf } from '../repositories/visibility.ts';
import { NotFoundError } from '../types/errors.ts';
import { sendCover } from './coverResponse.ts';

// No try/catch anywhere below: the Express 5 router calls next(err) itself when
// a handler's promise rejects.
export function createIllustrationController(
  repository: IllustrationRepository
) {
  return {
    list: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const items = await repository.list(id, viewerOf(req.user));
      if (!items) throw new NotFoundError('Chapter', id);
      res.json({ items } satisfies ItemsResponse<PublicIllustration>);
    },

    getImage: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const image = await repository.getImageData(id, viewerOf(req.user));
      if (!image) throw new NotFoundError('Illustration', id);
      // The cover helper is reused because the headers are the same.
      sendCover(res, image);
    },
  } satisfies Record<string, RequestHandler>;
}
