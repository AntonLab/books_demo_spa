import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFakeReportRepository,
  type FakeAccount,
  type FakeComment,
  type FakeReport,
} from '../repositories/reportRepository.fake.testkit.ts';
import {
  json,
  ROLE_COOKIES,
  USER_IDS,
  withAuthenticatedApp,
} from './routeTestKit.testkit.ts';

const ROLES = {
  user: 'user',
  author: 'author',
  admin: 'admin',
  superadmin: 'superadmin',
  otherAuthor: 'author',
} as const;
const ACCOUNTS = new Map<number, FakeAccount>(
  (Object.keys(USER_IDS) as (keyof typeof USER_IDS)[]).map((persona) => [
    USER_IDS[persona],
    { login: persona, status: 'active', role: ROLES[persona] },
  ])
);
const comment = (
  id: number,
  userId: number,
  tombstone: FakeComment['tombstone'] = null
): FakeComment => ({
  id,
  userId,
  bookId: 1,
  text: `Comment ${id}`,
  tombstone,
});
const COMMENTS = new Map<number, FakeComment>([
  [10, comment(10, USER_IDS.otherAuthor)],
  [11, comment(11, USER_IDS.otherAuthor, 'deleted')],
  [12, comment(12, USER_IDS.user)],
]);

const fakeReports = (rows: FakeReport[] = []) =>
  createFakeReportRepository({
    accounts: ACCOUNTS,
    comments: new Map([...COMMENTS].map(([id, row]) => [id, { ...row }])),
    rows,
  });

const reportComment = (
  base: string,
  id: number,
  body: unknown,
  cookie: string | null = ROLE_COOKIES.user
) =>
  fetch(`${base}/api/comments/${id}/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

const spam = { reason: 'spam' };

test('reporting needs a signed-in Account', async () => {
  await withAuthenticatedApp(
    { reportRepository: fakeReports() },
    async (base) => {
      assert.equal((await reportComment(base, 10, spam, null)).status, 401);
    }
  );
});

test('a signed-in Account reports another Account comment and gets the Report id', async () => {
  await withAuthenticatedApp(
    { reportRepository: fakeReports() },
    async (base) => {
      const response = await reportComment(base, 10, spam);
      assert.equal(response.status, 201);
      assert.equal(typeof (await json<{ id: number }>(response)).id, 'number');
    }
  );
});

test('own comment is 403, missing comment 404, Tombstone 400', async () => {
  await withAuthenticatedApp(
    { reportRepository: fakeReports() },
    async (base) => {
      assert.equal((await reportComment(base, 12, spam)).status, 403);
      assert.equal((await reportComment(base, 999, spam)).status, 404);
      assert.equal((await reportComment(base, 11, spam)).status, 400);
    }
  );
});

test('a second report by the same Account, or while one is Open, is 409', async () => {
  await withAuthenticatedApp(
    { reportRepository: fakeReports() },
    async (base) => {
      assert.equal((await reportComment(base, 10, spam)).status, 201);
      assert.equal((await reportComment(base, 10, spam)).status, 409);
      assert.equal(
        (await reportComment(base, 10, spam, ROLE_COOKIES.author)).status,
        409
      );
    }
  );
});

test('Other needs an explanation and the other reasons take none', async () => {
  await withAuthenticatedApp(
    { reportRepository: fakeReports() },
    async (base) => {
      assert.equal(
        (await reportComment(base, 10, { reason: 'other' })).status,
        400
      );
      assert.equal(
        (await reportComment(base, 10, { reason: 'spam', explanation: 'x' }))
          .status,
        400
      );
      assert.equal(
        (await reportComment(base, 10, { reason: 'nonsense' })).status,
        400
      );
      assert.equal(
        (
          await reportComment(base, 10, {
            reason: 'other',
            explanation: 'x'.repeat(501),
          })
        ).status,
        400
      );
      assert.equal(
        (
          await reportComment(base, 10, {
            reason: 'other',
            explanation: 'Doxxing',
          })
        ).status,
        201
      );
    }
  );
});
