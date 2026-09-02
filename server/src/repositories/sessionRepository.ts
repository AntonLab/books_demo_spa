import { Op } from 'sequelize';
import { Session } from '../models/Session.ts';

export interface SessionRecord {
  id: number;
  userId: number;
  expiresAt: Date;
}

export interface SessionRepository {
  create(
    userId: number,
    tokenHash: string,
    expiresAt: Date
  ): Promise<SessionRecord>;
  findValidByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteByTokenHash(tokenHash: string): Promise<boolean>;
  deleteAllForUser(userId: number): Promise<number>;
}

function toRecord(session: Session): SessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
  };
}

export function createSequelizeSessionRepository(): SessionRepository {
  return {
    async create(userId, tokenHash, expiresAt) {
      return toRecord(await Session.create({ userId, tokenHash, expiresAt }));
    },

    // Expiry is filtered in SQL rather than compared after the fetch, so an
    // expired row can never be returned by a caller that forgets to check.
    async findValidByTokenHash(tokenHash) {
      const session = await Session.findOne({
        where: { tokenHash, expiresAt: { [Op.gt]: new Date() } },
      });
      return session ? toRecord(session) : null;
    },

    async deleteByTokenHash(tokenHash) {
      return (await Session.destroy({ where: { tokenHash } })) > 0;
    },

    async deleteAllForUser(userId) {
      return Session.destroy({ where: { userId } });
    },
  };
}
