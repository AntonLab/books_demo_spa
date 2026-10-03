import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { ReadingListRepository } from '../repositories/readingListRepository.ts';
import { actorOf } from '../repositories/visibility.ts';
import { NotFoundError } from '../types/errors.ts';
import type {
  AddReadingListItemInput,
  CreateReadingListInput,
  ListReadingListsQuery,
  MyReadingListsQuery,
  ReorderReadingListItemsInput,
  UpdateReadingListInput,
} from '../types/readingList.ts';

// The owner of a list comes from the session and nowhere else; the repository
// answers 404 before 403 for every write.
export function createReadingListController(repository: ReadingListRepository) {
  return {
    list: async (req, res) => {
      const query = validatedQuery<ListReadingListsQuery>(req);
      const { items, total } =
        'userId' in query
          ? await repository.listByOwner(query)
          : await repository.listByBook(query);
      res.json({
        items,
        total,
        current: query.current,
        pageSize: query.pageSize,
      });
    },

    mine: async (req, res) => {
      const query = validatedQuery<MyReadingListsQuery>(req);
      res.json({ items: await repository.listMine(query, actorOf(req)) });
    },

    get: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const list = await repository.findById(id);
      if (!list) throw new NotFoundError('ReadingList', id);
      res.json(list);
    },

    editItems: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      res.json({ items: await repository.listEditItems(id, actorOf(req)) });
    },

    create: async (req, res) => {
      const input = validatedBody<CreateReadingListInput>(req);
      res.status(201).json(await repository.create(input, actorOf(req)));
    },

    update: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const input = validatedBody<UpdateReadingListInput>(req);
      res.json(await repository.update(id, actorOf(req), input));
    },

    remove: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      await repository.remove(id, actorOf(req));
      res.status(204).end();
    },

    addItem: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const target = validatedBody<AddReadingListItemInput>(req);
      res.status(201).json(await repository.addItem(id, actorOf(req), target));
    },

    removeItem: async (req, res) => {
      const { id, itemId } = validatedParams<{ id: number; itemId: number }>(
        req
      );
      await repository.removeItem(id, itemId, actorOf(req));
      res.status(204).end();
    },

    reorderItems: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const { itemIds } = validatedBody<ReorderReadingListItemsInput>(req);
      await repository.reorderItems(id, actorOf(req), itemIds);
      res.status(204).end();
    },

    copy: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      res.status(201).json(await repository.copy(id, actorOf(req)));
    },
  } satisfies Record<string, RequestHandler>;
}
