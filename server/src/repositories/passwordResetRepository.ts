import { Op } from 'sequelize';
import { PasswordResetToken } from '../models/PasswordResetToken.ts';
import { Session } from '../models/Session.ts';
import { User } from '../models/User.ts';

// How long a reset token outlives its own expiry before the expiry purge
// deletes it, used or not: a month of evidence that a reset was requested.
export const RESET_TOKEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface PasswordResetRepository {
  create(userId: number, tokenHash: string, expiresAt: Date): Promise<void>;
  invalidateAllForUser(userId: number): Promise<number>;
  // Supersedes the Account's live tokens and stores a new one atomically.
  replaceForUser(
    userId: number,
    tokenHash: string,
    expiresAt: Date
  ): Promise<void>;
  redeem(tokenHash: string, newPassword: string): Promise<boolean>;
  // The expiry purge's: deletes every token, used or not, whose expiresAt is
  // before `cutoff` — the purge passes now minus RESET_TOKEN_RETENTION_MS.
  deleteExpiredBefore(cutoff: Date): Promise<number>;
}

export function createSequelizePasswordResetRepository(): PasswordResetRepository {
  return {
    async create(userId, tokenHash, expiresAt) {
      await PasswordResetToken.create({ userId, tokenHash, expiresAt });
    },

    // Stamping usedAt rather than deleting: the row stays as evidence that a
    // reset was requested, and the same single-use check covers both. The
    // evidence is kept until 30 days past the token's expiry
    // (RESET_TOKEN_RETENTION_MS), when the hourly expiry purge deletes it.
    async invalidateAllForUser(userId) {
      const [affected] = await PasswordResetToken.update(
        { usedAt: new Date() },
        { where: { userId, usedAt: null } }
      );
      return affected;
    },

    // Stamping usedAt rather than deleting keeps the row as evidence that a
    // reset was requested, and the single-use check covers both. The evidence
    // stays until the hourly expiry purge (RESET_TOKEN_RETENTION_MS).
    async replaceForUser(userId, tokenHash, expiresAt) {
      const sequelize = PasswordResetToken.sequelize;
      if (!sequelize) {
        throw new Error('PasswordResetToken model is not initialised');
      }

      await sequelize.transaction(async (t) => {
        // A second request for the same Account waits here until the first
        // commits, then stamps its token; holds across server processes.
        const user = await User.findByPk(userId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        // Deleted after the controller's lookup: nothing to supersede or store.
        if (!user) return;

        await PasswordResetToken.update(
          { usedAt: new Date() },
          { where: { userId, usedAt: null }, transaction: t }
        );
        await PasswordResetToken.create(
          { userId, tokenHash, expiresAt },
          { transaction: t }
        );
      });
    },

    async redeem(tokenHash, newPassword) {
      const sequelize = PasswordResetToken.sequelize;
      if (!sequelize) {
        throw new Error('PasswordResetToken model is not initialised');
      }

      // One transaction across three tables: a partial apply would leave a
      // redeemed token beside a live pre-reset session, which is the exact
      // state this flow exists to prevent.
      return sequelize.transaction(async (t) => {
        const token = await PasswordResetToken.findOne({
          where: {
            tokenHash,
            usedAt: null,
            expiresAt: { [Op.gt]: new Date() },
          },
          transaction: t,
          // SELECT ... FOR UPDATE. Without it two concurrent redemptions of
          // the same token could both read it as unused.
          lock: t.LOCK.UPDATE,
        });
        if (!token) return false;

        // unscoped so the instance carries the password column, letting the
        // beforeSave hook see a real change and hash the new value.
        const user = await User.unscoped().findByPk(token.userId, {
          transaction: t,
        });
        if (!user) return false;

        user.password = newPassword;
        await user.save({ transaction: t });

        token.usedAt = new Date();
        await token.save({ transaction: t });

        await Session.destroy({
          where: { userId: token.userId },
          transaction: t,
        });

        return true;
      });
    },

    async deleteExpiredBefore(cutoff) {
      return PasswordResetToken.destroy({
        where: { expiresAt: { [Op.lt]: cutoff } },
      });
    },
  };
}
