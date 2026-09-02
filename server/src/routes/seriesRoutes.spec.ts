import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError } from '../types/errors.ts';
import type {
  SeriesListResult,
  SeriesRepository,
} from '../repositories/seriesRepository.ts';
import type { PublicSeries } from '../types/series.ts';
import { json, withApp } from './routeTestKit.testkit.ts';

const KNOWN_USER_ID = 1;

function createFakeRepository(): SeriesRepository {
  const rows = new Map<number, PublicSeries>();
  let nextId = 1;

  return {
    async create(input) {
      // Stands in for the foreign key: the real repository maps MySQL's
      // rejection to this same NotFoundError.
      if (input.userId !== KNOWN_USER_ID) {
        throw new NotFoundError('User', input.userId);
      }

      const now = new Date();
      const series: PublicSeries = {
        id: nextId,
        userId: input.userId,
        description: input.description,
        tags: input.tags,
        createdAt: now,
        updatedAt: now,
      };
      nextId += 1;
      rows.set(series.id, series);
      return series;
    },

    async list(query): Promise<SeriesListResult> {
      const all = [...rows.values()].filter(
        (row) =>
          (query.userId === undefined || row.userId === query.userId) &&
          (!query.tag || row.tags.includes(query.tag)) &&
          (!query.q || row.description.includes(query.q))
      );
      return {
        items: all.slice(query.offset, query.offset + query.limit),
        total: all.length,
      };
    },

    async findById(id) {
      return rows.get(id) ?? null;
    },

    async update(id, input) {
      const current = rows.get(id);
      if (!current) return null;
      const updated: PublicSeries = {
        ...current,
        description: input.description ?? current.description,
        tags: input.tags ?? current.tags,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return updated;
    },

    async remove(id) {
      return rows.delete(id);
    },
  };
}

const valid = {
  userId: KNOWN_USER_ID,
  description: 'A space opera in three parts',
  tags: ['sci-fi', 'epic'],
};

const post = (base: string, body: unknown) =>
  fetch(`${base}/api/series`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const patch = (base: string, id: number, body: unknown) =>
  fetch(`${base}/api/series/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

test('POST creates a series and echoes its tags', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, valid);
    const body = await json<PublicSeries>(response);

    assert.equal(response.status, 201);
    assert.equal(body.userId, KNOWN_USER_ID);
    assert.deepEqual(body.tags, ['sci-fi', 'epic']);
  });
});

test('POST defaults tags to an empty array when omitted', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, {
      userId: KNOWN_USER_ID,
      description: 'No tags yet',
    });

    assert.equal(response.status, 201);
    assert.deepEqual((await json<PublicSeries>(response)).tags, []);
  });
});

test('POST collapses duplicate tags before storing them', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, {
      ...valid,
      tags: ['epic', 'epic', 'sci-fi'],
    });

    assert.deepEqual((await json<PublicSeries>(response)).tags, [
      'epic',
      'sci-fi',
    ]);
  });
});

test('POST rejects a missing description with 400', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, { userId: KNOWN_USER_ID });

    assert.equal(response.status, 400);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /validation/i
    );
  });
});

test('POST against an unknown user is a 404, not a 500', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    const response = await post(base, { ...valid, userId: 999 });

    assert.equal(response.status, 404);
    assert.match(
      (await json<{ error: string }>(response)).error,
      /User 999 not found/
    );
  });
});

test('GET list returns items with the paging envelope', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    await post(base, valid);
    const response = await fetch(`${base}/api/series`);
    const body = await json<{
      total: number;
      limit: number;
      offset: number;
      items: unknown[];
    }>(response);

    assert.equal(response.status, 200);
    assert.deepEqual(
      { total: body.total, limit: body.limit, offset: body.offset },
      { total: 1, limit: 20, offset: 0 }
    );
    assert.equal(body.items.length, 1);
  });
});

test('GET list filters by tag and by owner', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    await post(base, valid);
    await post(base, { ...valid, description: 'Standalone', tags: ['drama'] });

    const byTag = await json<{ total: number }>(
      await fetch(`${base}/api/series?tag=drama`)
    );
    const byUser = await json<{ total: number }>(
      await fetch(`${base}/api/series?userId=${KNOWN_USER_ID}`)
    );
    const byOther = await json<{ total: number }>(
      await fetch(`${base}/api/series?userId=2`)
    );

    assert.equal(byTag.total, 1);
    assert.equal(byUser.total, 2);
    assert.equal(byOther.total, 0);
  });
});

test('GET by id returns 404 for a missing record', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    assert.equal((await fetch(`${base}/api/series/999`)).status, 404);
  });
});

test('GET by id rejects a non-numeric id with 400', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    assert.equal((await fetch(`${base}/api/series/abc`)).status, 400);
  });
});

test('PATCH replaces tags but leaves them alone when omitted', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    const created = await json<PublicSeries>(await post(base, valid));

    const retagged = await json<PublicSeries>(
      await patch(base, created.id, { tags: ['drama'] })
    );
    assert.deepEqual(retagged.tags, ['drama']);

    const renamed = await json<PublicSeries>(
      await patch(base, created.id, { description: 'Rewritten' })
    );
    assert.equal(renamed.description, 'Rewritten');
    assert.deepEqual(renamed.tags, ['drama']);
  });
});

test('PATCH ignores userId rather than re-parenting the series', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    const created = await json<PublicSeries>(await post(base, valid));
    const response = await patch(base, created.id, {
      userId: 2,
      description: 'Rewritten',
    });

    assert.equal(response.status, 200);
    assert.equal((await json<PublicSeries>(response)).userId, KNOWN_USER_ID);
  });
});

test('PATCH with an empty body is rejected with 400', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    const created = await json<PublicSeries>(await post(base, valid));

    assert.equal((await patch(base, created.id, {})).status, 400);
  });
});

test('DELETE removes the series, then reports 404', async () => {
  await withApp({ seriesRepository: createFakeRepository() }, async (base) => {
    const created = await json<PublicSeries>(await post(base, valid));

    const first = await fetch(`${base}/api/series/${created.id}`, {
      method: 'DELETE',
    });
    const second = await fetch(`${base}/api/series/${created.id}`, {
      method: 'DELETE',
    });

    assert.equal(first.status, 204);
    assert.equal(second.status, 404);
  });
});
