import { Op } from 'sequelize';
import { Session } from '../models/Session.ts';
import { User } from '../models/User.ts';

export interface SessionRecord {
  id: number;
  userId: number;
  expiresAt: Date;
}

// What opening a login's session came to. Three answers rather than a
// boolean, because the controller refuses the two failures differently: a
// changed credential as a failed login, a block as a block.
export const SESSION_OPENINGS = [
  'created',
  'credential-changed',
  'blocked',
] as const;
export type SessionOpening = (typeof SESSION_OPENINGS)[number];

export interface SessionRepository {
  // register's door: a brand-new account has no password change or block in
  // flight, so its session needs no re-check.
  create(
    userId: number,
    tokenHash: string,
    expiresAt: Date
  ): Promise<SessionRecord>;
  // login's door: opens the session only if the account still holds the
  // password hash the caller just verified and is not blocked.
  createIfCredentialCurrent(
    userId: number,
    tokenHash: string,
    expiresAt: Date,
    verifiedPasswordHash: string
  ): Promise<SessionOpening>;
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

    // A login verifies its password against a hash it read without a lock,
    // and argon2 is slow on purpose: a password change or a block can commit
    // in between and purge the account's sessions before this one exists. So
    // the account is re-read here, in the insert's own transaction, under a
    // shared lock. Either the read queues behind a change that holds the row
    // and then sees its new hash or its block, or the change queues behind
    // this transaction and its purge deletes the session committed here.
    // A plain read would not do: it waits for no lock, returns the row as it
    // was before an uncommitted change, and the insert's foreign-key check
    // then waits out that change and lands just after its purge.
    //
    // Any password change yields a new hash, even to the same password, since
    // argon2 salts afresh. An account that is gone counts as a changed
    // credential: the hash that was verified is no longer on file.
    async createIfCredentialCurrent(
      userId,
      tokenHash,
      expiresAt,
      verifiedPasswordHash
    ) {
      const sequelize = Session.sequelize;
      if (!sequelize) {
        throw new Error('Session model is not initialised');
      }

      return sequelize.transaction(async (transaction) => {
        // unscoped so the password comes back at all. MySQL receives the
        // lock as LOCK IN SHARE MODE, its older spelling of FOR SHARE.
        const user = await User.unscoped().findByPk(userId, {
          attributes: ['password', 'status'],
          transaction,
          lock: transaction.LOCK.SHARE,
        });
        if (!user || user.password !== verifiedPasswordHash) {
          return 'credential-changed';
        }
        // After the hash, as in the controller: a caller whose credential has
        // gone stale learns nothing about the account's status.
        if (user.status === 'blocked') return 'blocked';

        await Session.create({ userId, tokenHash, expiresAt }, { transaction });
        return 'created';
      });
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
