import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicNotification } from 'shared';
import type { MailMessage } from '../delivery/mailDelivery.ts';
import { recordLogs } from '../logger.testkit.ts';
import type { RecipientNews } from '../repositories/announcementRepository.ts';
import {
  ANNOUNCEMENT_INTERVAL_MS,
  runAnnouncementPass,
  startAnnouncementPass,
  type AnnouncementPassDeps,
} from './announcementPass.ts';

const NOW = new Date('2026-09-26T12:00:00.000Z');
const BASE = 'https://books.example.com';

const newChapter = (id: number): PublicNotification => ({
  id,
  kind: 'new_chapter',
  work: { type: 'book', id: 3, title: 'The Glass Harbour' },
  chapter: { id: 41, title: 'The Tide Bell' },
  chapterCount: 1,
  readAt: null,
  createdAt: NOW,
});

const news = (
  userId: number,
  email: string | null,
  notificationId = userId * 10
): RecipientNews => ({
  userId,
  email,
  notifications: [newChapter(notificationId)],
  chapters: [
    {
      bookId: 3,
      bookTitle: 'The Glass Harbour',
      chapterId: 41,
      chapterTitle: 'The Tide Bell',
    },
  ],
  books: [],
});

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

// Fakes that write down, in order, every step the pass takes. `online` lists
// the Accounts with an open stream; `failMailTo` makes those sends reject.
function fakes(
  t: TestContext,
  options: {
    recipients?: RecipientNews[];
    announce?: (now: Date) => Promise<RecipientNews[]>;
    online?: number[];
    failMailTo?: string[];
  } = {}
) {
  const lines = recordLogs(t);
  const steps: string[] = [];
  const announced: Date[] = [];
  const pushed: { userId: number; id: number }[] = [];
  const mailed: MailMessage[] = [];
  const online = new Set(options.online ?? []);
  const deps: AnnouncementPassDeps = {
    announcementRepository: {
      async announce(now) {
        steps.push('announce');
        announced.push(now);
        if (options.announce) return options.announce(now);
        return options.recipients ?? [];
      },
    },
    onlineRegistry: {
      async revalidate() {
        steps.push('revalidate');
      },
      isOnline(userId) {
        steps.push(`isOnline ${userId}`);
        return online.has(userId);
      },
      push(userId, notification) {
        pushed.push({ userId, id: notification.id });
      },
    },
    mailDelivery: {
      async send(message) {
        if (options.failMailTo?.includes(message.to)) {
          throw new Error('SMTP 451 try again later');
        }
        mailed.push(message);
      },
    },
    appBaseUrl: BASE,
  };
  return { deps, lines, steps, announced, pushed, mailed };
}

test('an Online recipient is pushed its Notifications and sent no email', async (t) => {
  const { deps, pushed, mailed } = fakes(t, {
    recipients: [news(5, 'reader@example.com')],
    online: [5],
  });

  await runAnnouncementPass(deps, NOW);

  assert.deepEqual(pushed, [{ userId: 5, id: 50 }]);
  assert.deepEqual(mailed, []);
});

test('a recipient not Online with an address gets one email for the pass', async (t) => {
  const { deps, pushed, mailed, announced } = fakes(t, {
    recipients: [news(5, 'reader@example.com')],
  });

  await runAnnouncementPass(deps, NOW);

  assert.deepEqual(announced, [NOW]);
  assert.deepEqual(pushed, []);
  assert.equal(mailed.length, 1);
  assert.equal(mailed[0]?.to, 'reader@example.com');
  assert.equal(
    mailed[0]?.subject,
    'New chapter: The Glass Harbour — The Tide Bell'
  );
  assert.match(
    mailed[0]?.text ?? '',
    /https:\/\/books\.example\.com\/profile#email-notifications/
  );
});

test('a recipient not Online without a mailable address is only left the Notification', async (t) => {
  const { deps, pushed, mailed } = fakes(t, { recipients: [news(5, null)] });

  await runAnnouncementPass(deps, NOW);

  assert.deepEqual(pushed, []);
  assert.deepEqual(mailed, []);
});

test('the registry is revalidated after the claim and before anyone is judged Online', async (t) => {
  const { deps, steps } = fakes(t, {
    recipients: [news(5, null), news(6, null)],
  });

  await runAnnouncementPass(deps, NOW);

  assert.deepEqual(steps, [
    'announce',
    'revalidate',
    'isOnline 5',
    'isOnline 6',
  ]);
});

test('a pass with nothing new neither revalidates nor sends', async (t) => {
  const { deps, steps, mailed } = fakes(t);

  await runAnnouncementPass(deps, NOW);

  assert.deepEqual(steps, ['announce']);
  assert.deepEqual(mailed, []);
});

test('a failed email is logged with its account and the other recipients are still mailed', async (t) => {
  const { deps, lines, mailed } = fakes(t, {
    recipients: [news(5, 'broken@example.com'), news(6, 'reader@example.com')],
    failMailTo: ['broken@example.com'],
  });

  await runAnnouncementPass(deps, NOW);

  assert.deepEqual(
    mailed.map((message) => message.to),
    ['reader@example.com']
  );
  assert.deepEqual(lines, [
    {
      level: 'error',
      message: 'Announcement mail failed',
      meta: { userId: 5, error: 'SMTP 451 try again later' },
    },
  ]);
});

test('a failed claim is logged and the pass resolves', async (t) => {
  const { deps, lines, steps } = fakes(t, {
    announce: async () => {
      throw new Error('Deadlock found when trying to get lock');
    },
  });

  await runAnnouncementPass(deps, NOW);

  assert.deepEqual(steps, ['announce']);
  assert.deepEqual(lines, [
    {
      level: 'error',
      message: 'Announcement pass failed',
      meta: 'Deadlock found when trying to get lock',
    },
  ]);
});

test('runs once at start and once per minute until stopped', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { deps, announced } = fakes(t);

  const pass = startAnnouncementPass(deps);
  await settle();
  assert.equal(announced.length, 1);

  t.mock.timers.tick(ANNOUNCEMENT_INTERVAL_MS);
  await settle();
  assert.equal(announced.length, 2);
  assert.equal(ANNOUNCEMENT_INTERVAL_MS, 60_000);

  pass.stop();
  t.mock.timers.tick(ANNOUNCEMENT_INTERVAL_MS);
  await settle();
  assert.equal(announced.length, 2);
});

test('a tick while a pass is still running starts no second one', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let finish: (recipients: RecipientNews[]) => void = () => {};
  const { deps, announced } = fakes(t, {
    announce: () =>
      new Promise<RecipientNews[]>((resolve) => {
        finish = resolve;
      }),
  });

  const pass = startAnnouncementPass(deps);
  t.mock.timers.tick(ANNOUNCEMENT_INTERVAL_MS);
  await settle();
  assert.equal(announced.length, 1);

  finish([]);
  await settle();
  t.mock.timers.tick(ANNOUNCEMENT_INTERVAL_MS);
  await settle();
  assert.equal(announced.length, 2);
  pass.stop();
});
