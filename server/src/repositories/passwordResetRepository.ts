import { Op } from 'sequelize';
import { PasswordResetToken } from '../models/PasswordResetToken.ts';
import { Session } from '../models/Session.ts';
import { User } from '../models/User.ts';

export interface PasswordResetRepository {
  create(userId: number, tokenHash: string, expiresAt: Date): Promise<void>;
  invalidateAllForUser(userId: number): Promise<number>;
  redeem(tokenHash: string, newPassword: string): Promise<boolean>;
}

export function createSequelizePasswordResetRepository(): PasswordResetRepository {
  return {
    async create(userId, tokenHash, expiresAt) {
      await PasswordResetToken.create({ userId, tokenHash, expiresAt });
    },

    // Stamping usedAt rather than deleting: the row stays as evidence that a
    // reset was requested, and the same single-use check covers both.
    async invalidateAllForUser(userId) {
      const [affected] = await PasswordResetToken.update(
        { usedAt: new Date() },
        { where: { userId, usedAt: null } }
      );
      return affected;
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
  };
}
