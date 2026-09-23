import type { Request, RequestHandler } from 'express';
import { processCoverImage } from '../images.ts';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import { scopeFor } from '../permissions/permissionStore.ts';
import type { BookRepository } from '../repositories/bookRepository.ts';
import { actorOf, viewerOf } from '../repositories/visibility.ts';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  UnsupportedMediaTypeError,
} from '../types/errors.ts';
import type {
  CreateBookInput,
  ListBooksQuery,
  UpdateBookInput,
} from '../types/book.ts';
import type { AddCoAuthorInput } from '../types/params.ts';
import type { ReorderSeriesBooksInput } from '../types/series.ts';

export interface BookController {
  create: RequestHandler;
  list: RequestHandler;
  getById: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
  addCoAuthor: RequestHandler;
  removeCoAuthor: RequestHandler;
  listInSeries: RequestHandler;
  reorderInSeries: RequestHandler;
  uploadCover: RequestHandler;
  removeCover: RequestHandler;
  getCover: RequestHandler;
}

// No try/catch anywhere below: the Express 5 router inspects the returned
// promise and calls next(err) itself when it rejects.
export function createBookController(
  repository: BookRepository
): BookController {
  // The other half of enforcement. requirePermission already refused `none`;
  // `any` needs nothing more, and `own` is the only case that has to look at
  // the row — which is why this cannot live in the middleware, where the row
  // is not loaded yet.
  //
  // Only `any` returns early. Every other value, a missing scope included,
  // falls through to the owner comparison: a handler mounted without
  // requirePermission fails closed rather than acting as `any`.
  //
  // 404 before 403, so a refusal cannot be used to probe which ids exist.
  //
  // `own` means "one of the book's Co-authors": a book has no single owner, and
  // every Co-author holds the same rights over it (ADR-0005).
  const assertCoAuthor = async (req: Request, id: number): Promise<void> => {
    const coAuthorIds = await repository.findCoAuthorIds(id);
    if (coAuthorIds === null) throw new NotFoundError('Book', id);
    if (req.user === undefined || !coAuthorIds.includes(req.user.id)) {
      throw new ForbiddenError('You may only change books you co-author');
    }
  };

  const assertMayTouch = async (req: Request, id: number): Promise<void> => {
    if (req.permissionScope === 'any') return;
    await assertCoAuthor(req, id);
  };

  // A series' Co-authors — or a Moderator under `any` — are the ones who may
  // change which books it holds and in what order.
  async function assertMayChangeSeries(
    req: Request,
    seriesId: number,
    refusal: string
  ): Promise<void> {
    if (req.permissionScope === 'any') return;

    const coAuthorIds = await repository.findSeriesCoAuthorIds(seriesId);
    if (coAuthorIds === null) throw new NotFoundError('Series', seriesId);
    if (req.user === undefined || !coAuthorIds.includes(req.user.id)) {
      throw new ForbiddenError(refusal);
    }
  }

  // Filing a book under a series changes that series too — it starts listing
  // the book — so the caller must co-author the series as well as the book.
  // The two Co-author lists are independent: a book credited to A and B may sit
  // in a series credited to A and C, and only A may file it there. Without
  // this an author could put their book into a stranger's series.
  // chapterController.assertMayChangeChaptersOf closes the same hole one level
  // down.
  //
  // null (unlinking) and an absent key (leaving the link alone) touch no
  // series, so neither needs a check. An absent series is still a 404 that
  // blames the series, and it comes before the 403, as everywhere else.
  const assertMayAddToSeries = async (
    req: Request,
    seriesId: number | null | undefined
  ): Promise<void> => {
    if (seriesId === null || seriesId === undefined) return;
    await assertMayChangeSeries(
      req,
      seriesId,
      'You may only add books to series you co-author'
    );
  };

  return {
    create: async (req, res) => {
      if (!req.user) throw new UnauthorizedError();

      const input = validatedBody<CreateBookInput>(req);
      await assertMayAddToSeries(req, input.seriesId);

      // The first Co-author comes from the session, never the body — otherwise
      // an author could create a book credited to someone else and the
      // co-author rule above would mean nothing.
      const book = await repository.create({ ...input, userId: req.user.id });
      res.status(201).json(book);
    },

    list: async (req, res) => {
      const query = validatedQuery<ListBooksQuery>(req);
      const { items, total } = await repository.list(query, viewerOf(req.user));
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    getById: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      // requirePermission fills req.user when a session cookie resolves and
      // leaves it unset otherwise — `guest` has `read: any` on books, so an
      // anonymous read still gets here. The viewer decides whether a Draft
      // book is readable at all — a hidden one is the same 404 as a missing
      // one — and a Guest's null is what makes viewerLikeId come back empty.
      const book = await repository.findDetailById(id, viewerOf(req.user));
      if (!book) throw new NotFoundError('Book', id);
      res.json(book);
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const input = validatedBody<UpdateBookInput>(req);
      // The book first: a caller who may not touch it learns nothing about
      // the series they named.
      await assertMayTouch(req, id);
      await assertMayAddToSeries(req, input.seriesId);

      const book = await repository.update(id, input);
      if (!book) throw new NotFoundError('Book', id);
      res.json(book);
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayTouch(req, id);

      const deleted = await repository.remove(id, actorOf(req));
      if (!deleted) throw new NotFoundError('Book', id);
      res.status(204).end();
    },

    addCoAuthor: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const { userId } = validatedBody<AddCoAuthorInput>(req);
      await assertCoAuthor(req, id);

      const book = await repository.addCoAuthor(id, userId, actorOf(req));
      if (!book) throw new NotFoundError('Book', id);
      res.json(book);
    },

    // Mounted behind requireAuth alone, so the matrix is consulted here. Leaving
    // is always allowed to a credited account, whatever its Role. Removing
    // someone else takes a Co-author holding `own` on books: `none` is an
    // account that is no longer an author, and `any` is a Moderator, who may
    // edit or delete a book but never change who is credited on it.
    removeCoAuthor: async (req, res) => {
      if (!req.user) throw new UnauthorizedError();
      const { id, userId } = validatedParams<{ id: number; userId: number }>(
        req
      );

      if (userId !== req.user.id) {
        if (scopeFor(req.user.role, 'books', 'update') !== 'own') {
          throw new ForbiddenError('Only a co-author may remove a co-author');
        }
        await assertCoAuthor(req, id);
      }

      const book = await repository.removeCoAuthor(id, userId, actorOf(req));
      if (!book) throw new NotFoundError('Book', id);
      res.json(book);
    },

    // The series editor's list, mounted behind `series × update`: it names the
    // Draft books filed in the series, which only the people who may reorder
    // them need to see.
    listInSeries: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayChangeSeries(
        req,
        id,
        'You may only see the books of series you co-author'
      );

      const items = await repository.listInSeries(id);
      if (!items) throw new NotFoundError('Series', id);
      res.json({ items });
    },

    reorderInSeries: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayChangeSeries(
        req,
        id,
        'You may only reorder the books of series you co-author'
      );

      const { bookIds } = validatedBody<ReorderSeriesBooksInput>(req);
      const found = await repository.reorderInSeries(id, bookIds);
      if (!found) throw new NotFoundError('Series', id);
      res.status(204).end();
    },

    // A1: books x update, then the same Co-author check PATCH uses.
    uploadCover: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      if (!Buffer.isBuffer(req.body)) {
        throw new UnsupportedMediaTypeError();
      }
      await assertMayTouch(req, id);

      const processed = await processCoverImage(req.body);
      const found = await repository.setCover(id, processed);
      if (!found) throw new NotFoundError('Book', id);

      const book = await repository.findById(id);
      if (!book) throw new NotFoundError('Book', id);
      res.json(book);
    },

    // A2: same guards as uploadCover; 204 whether or not a Cover existed, but
    // 404 for a missing Book. assertMayTouch alone cannot catch a missing
    // Book under `any` scope — it returns immediately for a Moderator — so
    // this checks removeCover's own report of whether the row was there.
    removeCover: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await assertMayTouch(req, id);

      const found = await repository.removeCover(id);
      if (!found) throw new NotFoundError('Book', id);
      res.status(204).end();
    },

    // A3: rides on books x read, which a guest holds; goes through the
    // repository's own readableBookWhere, so a Draft book's Cover is a 404
    // to anyone who may not read the book — the same 404 as a missing one.
    getCover: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const cover = await repository.getCoverData(id, viewerOf(req.user));
      if (!cover) throw new NotFoundError('Book', id);

      res
        .status(200)
        .set({
          'Content-Type': 'image/webp',
          'X-Content-Type-Options': 'nosniff',
          // Versioned by the URL's own ?v=, so immutable is safe (A3).
          'Cache-Control': 'private, max-age=31536000, immutable',
        })
        .send(cover.data);
    },
  };
}
