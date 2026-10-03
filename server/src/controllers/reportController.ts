import type { RequestHandler } from 'express';
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../middleware/validate.ts';
import type { ReportRepository } from '../repositories/reportRepository.ts';
import { actorOf } from '../repositories/visibility.ts';
import type {
  CreateReportInput,
  ListReportsQuery,
  ReportRange,
} from '../types/report.ts';

export function createReportController(repository: ReportRepository) {
  return {
    create: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const input = validatedBody<CreateReportInput>(req);
      res.status(201).json(await repository.create(id, input, actorOf(req)));
    },

    list: async (req, res) => {
      const query = validatedQuery<ListReportsQuery>(req);
      const { items, total } = await repository.list(query, actorOf(req));
      res.json({ items, total, limit: query.limit, offset: query.offset });
    },

    statistics: async (req, res) => {
      res.json(await repository.statistics(validatedQuery<ReportRange>(req)));
    },

    take: async (req, res) => {
      const { commentId } = validatedParams<{ commentId: number }>(req);
      await repository.take(commentId, actorOf(req));
      res.status(204).end();
    },

    uphold: async (req, res) => {
      const { commentId } = validatedParams<{ commentId: number }>(req);
      await repository.uphold(commentId, actorOf(req));
      res.status(204).end();
    },

    dismiss: async (req, res) => {
      const { commentId } = validatedParams<{ commentId: number }>(req);
      await repository.dismiss(commentId, actorOf(req));
      res.status(204).end();
    },
  } satisfies Record<string, RequestHandler>;
}
