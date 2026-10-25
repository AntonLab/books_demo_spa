process.env.NODE_ENV ??= 'test';

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Sequelize } from 'sequelize';
import { createSequelize } from '../db/sequelize.ts';
import { ensureDatabase } from '../db/ensureDatabase.ts';
import { testDbConfig } from '../db/testDb.testkit.ts';
import { skipWithoutMysql } from '../db/mysqlProbe.testkit.ts';
import { initModels } from '../models/index.ts';
import { Book } from '../models/Book.ts';
import { Chapter } from '../models/Chapter.ts';
import { Illustration } from '../models/Illustration.ts';
import { Series } from '../models/Series.ts';
import { User } from '../models/User.ts';
import { createCreditedBook } from '../models/creditedBook.testkit.ts';
import { createSequelizeIllustrationRepository } from './illustrationRepository.ts';

const skip = await skipWithoutMysql();

const owner = {
  login: 'IllustrationOwner',
  email: 'illustrations@example.com',
  password: 'hunter2hunter2',
  firstName: 'Ilya',
  lastName: 'Owner',
};

describe(
  'illustrationRepository.updateCaption against real MySQL',
  { skip },
  () => {
    let sequelize: Sequelize;
    let illustrationId: number;
    const repository = createSequelizeIllustrationRepository();

    before(async () => {
      const db = testDbConfig('illustrations');
      await ensureDatabase(db);
      sequelize = createSequelize(db);
      initModels(sequelize);
      await sequelize.sync({ force: true });
    });

    after(async () => {
      await sequelize.close();
    });

    beforeEach(async () => {
      // Children first: the foreign keys forbid clearing parents out from
      // under them.
      await Illustration.destroy({ where: {}, truncate: false });
      await Chapter.destroy({ where: {}, truncate: false });
      await Book.destroy({ where: {}, truncate: false });
      await Series.destroy({ where: {}, truncate: false });
      await User.destroy({ where: {}, truncate: false });

      const ownerId = (await User.create(owner)).id;
      const bookId = (
        await createCreditedBook(
          { title: 'A Novel', description: 'A novel', tags: [] },
          [ownerId]
        )
      ).id;
      const chapter = await Chapter.create({
        bookId,
        title: 'Chapter 1',
        text: 'Once upon a time.',
        position: 1,
        publishedAt: new Date(),
      });
      illustrationId = (
        await Illustration.create({
          chapterId: chapter.id,
          position: 3,
          caption: 'Old',
          width: 800,
          height: 600,
        })
      ).id;
    });

    test('updates the caption and returns the row with a newer updatedAt', async () => {
      const before = await Illustration.findByPk(illustrationId);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const result = await repository.updateCaption(illustrationId, 'New');
      assert.equal(result?.id, illustrationId);
      assert.equal(result?.caption, 'New');
      assert.equal(result?.position, 3);
      assert.equal(result?.width, 800);
      assert.equal(result?.height, 600);
      assert.ok(result && result.updatedAt > before!.updatedAt);
      assert.equal(
        (await Illustration.findByPk(illustrationId))?.caption,
        'New'
      );
    });

    test('a null caption clears the caption', async () => {
      const result = await repository.updateCaption(illustrationId, null);
      assert.equal(result?.caption, null);
    });

    test('an unknown id is null', async () => {
      assert.equal(
        await repository.updateCaption(illustrationId + 10_000, 'x'),
        null
      );
    });

    // A delete arriving right after the read must wait for updateCaption's
    // transaction. The wrapper starts the delete on another connection after
    // the real read, then waits 300 ms: unlocked, the delete finishes inside
    // that window; locked, it is still blocked.
    test('a delete that arrives after the read waits for the caption write', async () => {
      const realFindByPk = Illustration.findByPk;
      let pendingDelete: Promise<unknown> = Promise.resolve();
      let deleteFinishedDuringRead = false;
      Illustration.findByPk = async function (
        this: typeof Illustration,
        ...args: Parameters<typeof Illustration.findByPk>
      ) {
        const row = await realFindByPk.apply(this, args);
        pendingDelete = Illustration.destroy({ where: { id: illustrationId } });
        deleteFinishedDuringRead = await Promise.race([
          pendingDelete.then(() => true),
          new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(false), 300)
          ),
        ]);
        return row;
      } as typeof Illustration.findByPk;
      try {
        const result = await repository.updateCaption(illustrationId, 'New');
        await pendingDelete;
        assert.equal(
          deleteFinishedDuringRead,
          false,
          'a delete finished while updateCaption held the row unlocked'
        );
        assert.equal(result?.caption, 'New');
        assert.equal(await Illustration.findByPk(illustrationId), null);
      } finally {
        Illustration.findByPk = realFindByPk;
      }
    });
  }
);
