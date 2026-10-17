import type { RequestHandler } from 'express';
import type { ItemsResponse, PublicIllustration } from 'shared';
import { validatedBody, validatedParams } from '../middleware/validate.ts';
import type { IllustrationRepository } from '../repositories/illustrationRepository.ts';
import { viewerOf } from '../repositories/visibility.ts';
import { processIllustrationImage } from '../images.ts';
import { NotFoundError, UnsupportedMediaTypeError } from '../types/errors.ts';
import type {
  ReorderIllustrationsInput,
  UpdateIllustrationInput,
} from '../types/illustration.ts';
import { assertMayChange, type CoAuthorTarget } from './coAuthorGuard.ts';
import { sendCover } from './coverResponse.ts';

// No try/catch anywhere below: the Express 5 router calls next(err) itself when
// a handler's promise rejects.
export function createIllustrationController(
  repository: IllustrationRepository
) {
  const illustrationTarget = (id: number): CoAuthorTarget => ({
    resource: 'Illustration',
    id,
    coAuthorIds: () => repository.findCoAuthorIds(id),
  });

  return {
    list: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const items = await repository.list(id, viewerOf(req.user));
      if (!items) throw new NotFoundError('Chapter', id);
      res.json({ items } satisfies ItemsResponse<PublicIllustration>);
    },

    // Chapters x update, then the Co-author check, then the body: a refused
    // upload is never decoded.
    upload: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayChange(
        req,
        {
          resource: 'Chapter',
          id,
          coAuthorIds: () => repository.findChapterCoAuthorIds(id),
        },
        'You may only change chapters in books you co-author'
      );
      if (!Buffer.isBuffer(req.body)) throw new UnsupportedMediaTypeError();

      const processed = await processIllustrationImage(req.body);
      res.status(201).json(await repository.create(id, processed));
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayChange(
        req,
        illustrationTarget(id),
        'You may only change chapters in books you co-author'
      );

      const { caption } = validatedBody<UpdateIllustrationInput>(req);
      const row = await repository.updateCaption(id, caption);
      if (!row) throw new NotFoundError('Illustration', id);
      res.json(row);
    },

    reorder: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayChange(
        req,
        {
          resource: 'Chapter',
          id,
          coAuthorIds: () => repository.findChapterCoAuthorIds(id),
        },
        'You may only change chapters in books you co-author'
      );

      const { illustrationIds } = validatedBody<ReorderIllustrationsInput>(req);
      const items = await repository.reorder(id, illustrationIds);
      res.json({ items } satisfies ItemsResponse<PublicIllustration>);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayChange(
        req,
        illustrationTarget(id),
        'You may only change chapters in books you co-author'
      );

      if (!(await repository.remove(id))) {
        throw new NotFoundError('Illustration', id);
      }
      res.status(204).end();
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
