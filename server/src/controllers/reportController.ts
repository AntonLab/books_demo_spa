import type { RequestHandler } from 'express';
import { validatedBody, validatedParams } from '../middleware/validate.ts';
import type { ReportRepository } from '../repositories/reportRepository.ts';
import { actorOf } from '../repositories/visibility.ts';
import type { CreateReportInput } from '../types/report.ts';

export function createReportController(repository: ReportRepository) {
  return {
    create: async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const input = validatedBody<CreateReportInput>(req);
      res.status(201).json(await repository.create(id, input, actorOf(req)));
    },
  } satisfies Record<string, RequestHandler>;
}
