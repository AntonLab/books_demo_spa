import type { RequestHandler } from 'express';
import { validatedParams } from '../middleware/validate.ts';
import type { AccountRepository } from '../repositories/accountRepository.ts';
import { NotFoundError } from '../types/errors.ts';

export function createAccountController(deps: {
  accountRepository: AccountRepository;
}) {
  return {
    getProfile: (async (req, res) => {
      const { id } = validatedParams<{ id: number }>(req);
      const profile = await deps.accountRepository.findProfile(id);
      if (!profile) throw new NotFoundError('Account', id);
      res.json(profile);
    }) satisfies RequestHandler,
  };
}
