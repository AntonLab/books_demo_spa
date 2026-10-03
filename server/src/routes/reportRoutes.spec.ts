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

const DAY = '?from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z';
let nextRowId = 1;
const row = (
  commentId: number,
  createdAt: string,
  extra: Partial<FakeReport> = {}
): FakeReport => ({
  id: nextRowId++,
  commentId,
  reporterId: USER_IDS.user,
  isSystem: false,
  reportedAccountId: COMMENTS.get(commentId)?.userId ?? null,
  reason: 'spam',
  explanation: null,
  status: 'new',
  moderatorId: null,
  settledText: null,
  takenAt: null,
  settledAt: null,
  createdAt: new Date(createdAt),
  ...extra,
});
const get = (
  base: string,
  path: string,
  cookie: string | null = ROLE_COOKIES.admin
) => fetch(`${base}/api/reports${path}`, { headers: cookie ? { cookie } : {} });
const act = (
  base: string,
  action: string,
  commentId: number | string,
  cookie: string | null = ROLE_COOKIES.admin
) =>
  fetch(`${base}/api/reports/${commentId}/${action}`, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  });
const listed = async (base: string, query = DAY) =>
  json<{
    items: {
      id: number;
      status: string;
      moderatorLogin: string | null;
      moderatorId: number | null;
      isOwnComment: boolean;
      comment: { tombstone: string | null };
    }[];
    total: number;
    limit: number;
    offset: number;
  }>(await get(base, query));

test('a Guest gets 401 and a non-Moderator 403, even for a bad query', async () => {
  await withAuthenticatedApp(
    { reportRepository: fakeReports() },
    async (base) => {
      for (const path of [DAY, '/statistics' + DAY, '?from=bad']) {
        assert.equal((await get(base, path, null)).status, 401);
        for (const cookie of [ROLE_COOKIES.user, ROLE_COOKIES.author]) {
          assert.equal((await get(base, path, cookie)).status, 403);
        }
      }
      assert.equal((await act(base, 'take', 10, null)).status, 401);
      assert.equal(
        (await act(base, 'take', 10, ROLE_COOKIES.user)).status,
        403
      );
      assert.equal(
        (await act(base, 'take', 'abc', ROLE_COOKIES.user)).status,
        403
      );
    }
  );
});

test('list pages Reports of the range newest first, [from, to) at the edges', async () => {
  const rows = [
    row(10, '2026-10-01T00:00:00.000Z'),
    row(10, '2026-10-01T12:00:00.000Z', { status: 'dismissed' }),
    row(10, '2026-10-02T00:00:00.000Z'),
    row(10, '2026-09-30T23:59:59.999Z'),
  ];
  await withAuthenticatedApp(
    { reportRepository: fakeReports(rows) },
    async (base) => {
      const page = await listed(base);
      assert.deepEqual(
        page.items.map((item) => item.id),
        [rows[1]?.id, rows[0]?.id]
      );
      assert.deepEqual([page.total, page.limit, page.offset], [2, 20, 0]);
      assert.equal((await listed(base, `${DAY}&status=dismissed`)).total, 1);
      assert.deepEqual(
        (await listed(base, `${DAY}&limit=1&offset=1`)).items.map(
          (item) => item.id
        ),
        [rows[0]?.id]
      );
    }
  );
});

test('list refuses an inverted range, a missing bound, a bad status and a bad limit with 400', async () => {
  await withAuthenticatedApp(
    { reportRepository: fakeReports() },
    async (base) => {
      for (const query of [
        '?from=2026-10-02T00:00:00.000Z&to=2026-10-01T00:00:00.000Z',
        '?from=2026-10-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z',
        '?from=2026-10-01T00:00:00.000Z',
        `${DAY}&status=open`,
        `${DAY}&limit=101`,
      ]) {
        assert.equal((await get(base, query)).status, 400, query);
      }
    }
  );
});

test('Take then Uphold removes the Comment; any Moderator may finish what another took', async () => {
  const rows = [row(10, '2026-10-01T10:00:00.000Z')];
  await withAuthenticatedApp(
    { reportRepository: fakeReports(rows) },
    async (base) => {
      assert.equal((await act(base, 'uphold', 10)).status, 409);
      assert.equal((await act(base, 'take', 10)).status, 204);
      assert.equal((await act(base, 'take', 10)).status, 409);
      assert.equal(
        (await act(base, 'uphold', 10, ROLE_COOKIES.superadmin)).status,
        204
      );
      const [item] = (await listed(base)).items;
      assert.deepEqual(
        [
          item?.status,
          item?.moderatorLogin,
          item?.moderatorId,
          item?.comment.tombstone,
        ],
        ['upheld', 'superadmin', USER_IDS.superadmin, 'removed']
      );
    }
  );
});

test('Dismiss needs In review and leaves the Comment alone', async () => {
  const rows = [row(10, '2026-10-01T10:00:00.000Z')];
  await withAuthenticatedApp(
    { reportRepository: fakeReports(rows) },
    async (base) => {
      assert.equal((await act(base, 'dismiss', 10)).status, 409);
      await act(base, 'take', 10);
      assert.equal((await act(base, 'dismiss', 10)).status, 204);
      const [item] = (await listed(base)).items;
      assert.deepEqual(
        [item?.status, item?.comment.tombstone],
        ['dismissed', null]
      );
    }
  );
});

test('a Moderator may not act on its own Comment (403), missing is 404, a bad id is 400', async () => {
  const rows = [
    row(10, '2026-10-01T10:00:00.000Z', {
      reportedAccountId: USER_IDS.otherAuthor,
    }),
  ];
  await withAuthenticatedApp(
    { reportRepository: fakeReports(rows) },
    async (base) => {
      assert.equal(
        (await act(base, 'take', 10, ROLE_COOKIES.otherAuthor)).status,
        403
      );
      assert.equal((await act(base, 'take', 999)).status, 404);
      assert.equal((await act(base, 'take', 'abc')).status, 400);
    }
  );
});

test('statistics: zeros and a null average for an empty range, counts for a filled one', async () => {
  const rows = [
    row(10, '2026-10-01T10:00:00.000Z', {
      status: 'dismissed',
      settledAt: new Date('2026-10-01T10:01:00.000Z'),
    }),
  ];
  await withAuthenticatedApp(
    { reportRepository: fakeReports(rows) },
    async (base) => {
      const stats = await json<{
        byStatus: Record<string, number>;
        byReason: Record<string, number>;
        topAccounts: unknown[];
        averageSettleSeconds: number | null;
      }>(await get(base, `/statistics${DAY}`));
      assert.deepEqual(
        [
          stats.byStatus.dismissed,
          stats.byReason.spam,
          stats.averageSettleSeconds,
        ],
        [1, 1, 60]
      );
      const empty = await json<typeof stats>(
        await get(
          base,
          '/statistics?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z'
        )
      );
      assert.deepEqual(
        [empty.byStatus.new, empty.topAccounts, empty.averageSettleSeconds],
        [0, [], null]
      );
      assert.equal(
        (await get(base, '/statistics?from=2026-10-02&to=2026-10-01')).status,
        400
      );
    }
  );
});
