import { Op } from 'sequelize';
import { PasswordResetToken } from '../models/PasswordResetToken.ts';
import { Session } from '../models/Session.ts';
import { User } from '../models/User.ts';
import { sequelizeOf } from './sequelizeOf.ts';

// How long a reset token outlives its own expiry before the expiry purge
// deletes it, used or not: a month of evidence that a reset was requested.
export const RESET_TOKEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface PasswordResetRepository {
  create(userId: number, tokenHash: string, expiresAt: Date): Promise<void>;
  // Stamps the Account's live tokens used and stores a new one in one locked
  // transaction.
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

    async replaceForUser(userId, tokenHash, expiresAt) {
      // Lock order: user row, then token rows. redeem must match.
      await sequelizeOf(PasswordResetToken).transaction(async (t) => {
        // Serialises requests per Account across processes: the second waits
        // for the first commit.
        const user = await User.findByPk(userId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        // Deleted after the controller's lookup: nothing to supersede or store.
        if (!user) return;

        // Stamp usedAt, do not delete: the row stays as evidence a reset was
        // requested, and the single-use check covers both.
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
      // One transaction across three tables: a partial apply would leave a
      // redeemed token beside a live pre-reset session, which is the exact
      // state this flow exists to prevent.
      // Lock order: user row, then token rows, same as replaceForUser.
      // Else the two deadlock.
      return sequelizeOf(PasswordResetToken).transaction(async (t) => {
        const live = {
          tokenHash,
          usedAt: null,
          expiresAt: { [Op.gt]: new Date() },
        };
        // Unlocked: only to learn whose row to lock first.
        const found = await PasswordResetToken.findOne({
          where: live,
          transaction: t,
        });
        if (!found) return false;

        // unscoped so the instance carries the password column, letting the
        // beforeSave hook see a real change and hash the new value.
        const user = await User.unscoped().findByPk(found.userId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!user) return false;

        // Re-read under lock: the first read's REPEATABLE READ snapshot still
        // shows a token that replaceForUser stamped used meanwhile. FOR
        // UPDATE also stops two concurrent redemptions both reading it as
        // unused.
        const token = await PasswordResetToken.findOne({
          where: live,
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!token) return false;

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
