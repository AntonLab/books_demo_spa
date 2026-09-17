process.env.NODE_ENV ??= 'test';

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Sequelize } from 'sequelize';
import sharp from 'sharp';
import { createApp } from './app.ts';
import { parseConfig } from './db/config.ts';
import { ensureDatabase } from './db/ensureDatabase.ts';
import { skipWithoutMysql } from './db/mysqlProbe.testkit.ts';
import { createSequelize } from './db/sequelize.ts';
import { createLoggerResetDelivery } from './delivery/resetDelivery.ts';
import { logger } from './logger.ts';
import {
  XSRF_COOKIE_NAME,
  XSRF_HEADER_NAME,
} from './middleware/csrfProtection.ts';
import { initModels, User } from './models/index.ts';
import { syncPermissions } from './permissions/permissionStore.ts';
import { createSequelizeBookRepository } from './repositories/bookRepository.ts';
import { createSequelizeChapterRepository } from './repositories/chapterRepository.ts';
import { createSequelizeCommentRepository } from './repositories/commentRepository.ts';
import { createSequelizeLikeRepository } from './repositories/likeRepository.ts';
import { createSequelizeNotificationRepository } from './repositories/notificationRepository.ts';
import { createSequelizePasswordResetRepository } from './repositories/passwordResetRepository.ts';
import { createSequelizeSessionRepository } from './repositories/sessionRepository.ts';
import { createSequelizeSeriesRepository } from './repositories/seriesRepository.ts';
import { createSequelizeUserRepository } from './repositories/userRepository.ts';
import type { BookDetail, PublicBook } from './types/book.ts';
import type { PublicChapter } from './types/chapter.ts';
import type { CommentWithAuthor, PublicComment } from './types/comment.ts';
import type { RegistrableRole } from './types/permission.ts';
import type { PublicSeries } from './types/series.ts';
import type { PublicUser } from './types/user.ts';

// The route specs run createApp on fake repositories and the repository specs
// run the real repositories without HTTP, so neither proves the two meet. This
// suite does: one app built exactly as src/index.ts builds it, on MySQL, driven
// over HTTP by clients that sign in and send the XSRF token the way the real
// client does. One scenario per permission lookup that only the database can
// answer — each a happy path and the refusal that shows the lookup ran.
//
// A schema of its own, like every MySQL-backed suite: node:test runs spec
// files in parallel processes, and two suites calling sync({ force: true }) on
// one database would drop each other's tables mid-run.
const TEST_DB_NAME = `${process.env.TEST_DB_NAME ?? 'books_demo_spa_test'}_app`;

// Parsed inside the suite, not at import: parseConfig throws without DB_USER,
// which is exactly when the suite should skip instead.
function testConfig() {
  return parseConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: TEST_DB_NAME,
  });
}

const skip = await skipWithoutMysql();

const PASSWORD = 'Password123!';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Reply<T> {
  status: number;
  body: T;
}

interface ErrorBody {
  error: string;
}

// Every refusal below is a 403, and so is a write the CSRF layers turn away.
// Naming the message is what shows the refusal came from the check under test.
function assertRefused(reply: Reply<unknown>, error: string): void {
  assert.equal(reply.status, 403);
  assert.equal((reply.body as ErrorBody).error, error);
}

interface SendOptions {
  // Off only for the one request that proves a write without it is refused.
  withXsrfToken?: boolean;
}

// One browser's worth of state against the running app: the cookies the
// server set, replayed on every request, and — on every write — the trusted
// Origin a browser sends and the XSRF token echoed from its script-readable
// cookie into X-XSRF-Token, as request() in client/src/api/client.ts does.
// Nothing here computes a token: a client that was never issued one sends
// none, so a signed-in write passing below is the real handshake passing.
interface Browser {
  send<T>(
    method: Method,
    path: string,
    body?: unknown,
    options?: SendOptions
  ): Promise<Reply<T>>;
  // The two credentials a raw (non-JSON) upload has to carry itself, since
  // send() always JSON-encodes its body. Both come from the same jar send()
  // reads, so a raw request built from them is the same handshake.
  cookieHeader(): string;
  xsrfToken(): string;
}

function createBrowser(base: string, trustedOrigin: string): Browser {
  const jar = new Map<string, string>();

  // Just enough of a cookie jar: a cleared cookie comes back with an Expires
  // in the past (res.clearCookie), and every other Set-Cookie replaces the
  // stored value.
  const store = (response: Response): void => {
    for (const line of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = line.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator).trim();
      const expired = attributes.some((attribute) => {
        const [key = '', value = ''] = attribute.split('=');
        return (
          key.trim().toLowerCase() === 'expires' &&
          Date.parse(value) <= Date.now()
        );
      });

      if (expired) jar.delete(name);
      else jar.set(name, pair.slice(separator + 1).trim());
    }
  };

  return {
    async send<T>(
      method: Method,
      path: string,
      body?: unknown,
      { withXsrfToken = true }: SendOptions = {}
    ): Promise<Reply<T>> {
      const headers: Record<string, string> = {};
      if (jar.size > 0) {
        headers.cookie = [...jar]
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');
      }
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (method !== 'GET') {
        // The client reaches the API through its dev proxy, so its writes name
        // APP_BASE_URL rather than the API's own host.
        headers.origin = trustedOrigin;
        const token = jar.get(XSRF_COOKIE_NAME);
        if (withXsrfToken && token !== undefined) {
          headers[XSRF_HEADER_NAME] = decodeURIComponent(token);
        }
      }

      const response = await fetch(`${base}/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      store(response);

      // A 204 carries no body at all.
      const text = await response.text();
      return {
        status: response.status,
        body: (text === '' ? undefined : JSON.parse(text)) as T,
      };
    },
    cookieHeader(): string {
      return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    },
    xsrfToken(): string {
      const token = jar.get(XSRF_COOKIE_NAME);
      if (token === undefined) {
        throw new Error('No XSRF token issued to this browser yet');
      }
      return decodeURIComponent(token);
    },
  };
}

interface Visitor {
  browser: Browser;
  user: PublicUser;
}

describe('the full stack from HTTP to MySQL', { skip }, () => {
  let sequelize: Sequelize;
  let server: Server;
  let base: string;
  let trustedOrigin: string;

  const openBrowser = () => createBrowser(base, trustedOrigin);

  // Registration opens the session itself, so the account is signed in from
  // the response on. Logins are distinct across the whole file: the schema is
  // not cleared between tests, and nothing here needs it to be.
  const signUp = async (
    login: string,
    role: RegistrableRole = 'user'
  ): Promise<Visitor> => {
    const browser = openBrowser();
    const { status, body } = await browser.send<PublicUser>(
      'POST',
      '/auth/register',
      {
        login,
        email: `${login}@example.com`,
        password: PASSWORD,
        firstName: login,
        lastName: 'Tester',
        role,
      }
    );
    assert.equal(status, 201, `registering ${login}`);
    return { browser, user: body };
  };

  const signIn = async (login: string): Promise<Visitor> => {
    const browser = openBrowser();
    const { status, body } = await browser.send<PublicUser>(
      'POST',
      '/auth/login',
      { login, password: PASSWORD }
    );
    assert.equal(status, 200, `signing in as ${login}`);
    return { browser, user: body };
  };

  const createBook = async (author: Visitor, title: string) => {
    const { status, body } = await author.browser.send<PublicBook>(
      'POST',
      '/books',
      { title, description: `${title}, in brief` }
    );
    assert.equal(status, 201, `creating ${title}`);
    return body;
  };

  before(async () => {
    // Built the way src/index.ts builds the app. That file runs main() when it
    // is imported, so its steps are repeated here rather than imported — keep
    // the two in step. The one deliberate difference is sync({ force: true }):
    // a red run leaves this schema behind for inspection, and the next run
    // must not inherit its rows.
    const config = testConfig();
    trustedOrigin = config.appBaseUrl;
    await ensureDatabase(config.db);
    sequelize = createSequelize(config.db);
    initModels(sequelize);
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
    await syncPermissions();

    const app = createApp({
      userRepository: createSequelizeUserRepository(),
      seriesRepository: createSequelizeSeriesRepository(),
      bookRepository: createSequelizeBookRepository(),
      chapterRepository: createSequelizeChapterRepository(),
      commentRepository: createSequelizeCommentRepository(),
      likeRepository: createSequelizeLikeRepository(),
      notificationRepository: createSequelizeNotificationRepository(),
      sessionRepository: createSequelizeSessionRepository(),
      passwordResetRepository: createSequelizePasswordResetRepository(),
      resetDelivery: createLoggerResetDelivery(logger, config.appBaseUrl),
      trustedOrigin: config.appBaseUrl,
    });

    // An ephemeral port, so this suite never collides with a running server.
    server = app.listen(0);
    await once(server, 'listening');
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await sequelize.close();
  });

  test('a registered account signs in, and only writes carrying its XSRF token get through', async () => {
    const registered = await signUp('reader');
    const { browser, user } = await signIn('reader');
    assert.equal(user.id, registered.user.id);

    const me = await browser.send<PublicUser>('GET', '/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.id, registered.user.id);
    assert.equal(me.body.login, 'reader');

    assertRefused(
      await browser.send('POST', '/auth/logout', undefined, {
        withXsrfToken: false,
      }),
      'Missing or invalid CSRF token'
    );
    // Refused ahead of the controller, so the session row is still there.
    assert.equal((await browser.send('GET', '/auth/me')).status, 200);

    assert.equal((await browser.send('POST', '/auth/logout')).status, 204);
    assert.equal((await browser.send('GET', '/auth/me')).status, 401);
  });

  test("a Book's Co-author may edit it, and another Author may not until credited", async () => {
    const first = await signUp('firstAuthor', 'author');
    const second = await signUp('secondAuthor', 'author');
    const book = await createBook(first, 'Shared Shore');
    const edit = { description: 'Rewritten by the second Co-author' };

    assertRefused(
      await second.browser.send('PATCH', `/books/${book.id}`, edit),
      'You may only change books you co-author'
    );

    const credited = await first.browser.send<PublicBook>(
      'POST',
      `/books/${book.id}/co-authors`,
      { userId: second.user.id }
    );
    assert.equal(credited.status, 200);
    assert.deepEqual(
      credited.body.authors.map((author) => author.id),
      [first.user.id, second.user.id]
    );

    const edited = await second.browser.send<PublicBook>(
      'PATCH',
      `/books/${book.id}`,
      edit
    );
    assert.equal(edited.status, 200);
    assert.equal(edited.body.description, edit.description);
  });

  test('filing a Book into a Series takes a Co-author of both', async () => {
    const seriesAuthor = await signUp('seriesAuthor', 'author');
    const bookAuthor = await signUp('bookOnlyAuthor', 'author');

    const series = await seriesAuthor.browser.send<PublicSeries>(
      'POST',
      '/series',
      { title: 'The Long Tide', description: 'A trilogy' }
    );
    assert.equal(series.status, 201);

    // Credited on the book alongside bookAuthor, who is not credited on the
    // series: the two Co-author lists are independent.
    const book = await createBook(bookAuthor, 'Low Water');
    assert.equal(
      (
        await bookAuthor.browser.send('POST', `/books/${book.id}/co-authors`, {
          userId: seriesAuthor.user.id,
        })
      ).status,
      200
    );
    const filing = { seriesId: series.body.id };

    assertRefused(
      await bookAuthor.browser.send('PATCH', `/books/${book.id}`, filing),
      'You may only add books to series you co-author'
    );

    const filed = await seriesAuthor.browser.send<PublicBook>(
      'PATCH',
      `/books/${book.id}`,
      filing
    );
    assert.equal(filed.status, 200);
    assert.equal(filed.body.seriesId, series.body.id);
  });

  test("a Chapter belongs to its Book's Co-authors, and nobody else may add or edit one", async () => {
    const author = await signUp('chapterAuthor', 'author');
    const stranger = await signUp('chapterStranger', 'author');
    const book = await createBook(author, 'Quiet Rooms');
    const chapter = { bookId: book.id, title: 'One', text: 'It began.' };

    assertRefused(
      await stranger.browser.send('POST', '/chapters', chapter),
      'You may only add chapters to books you co-author'
    );
    const created = await author.browser.send<PublicChapter>(
      'POST',
      '/chapters',
      chapter
    );
    assert.equal(created.status, 201);

    // The version the edit was based on travels as JSON already, an ISO
    // string, which is exactly what the schema asks for.
    const edit = {
      title: 'Chapter One',
      expectedUpdatedAt: created.body.updatedAt,
    };
    assertRefused(
      await stranger.browser.send(
        'PATCH',
        `/chapters/${created.body.id}`,
        edit
      ),
      'You may only change chapters in books you co-author'
    );

    const edited = await author.browser.send<PublicChapter>(
      'PATCH',
      `/chapters/${created.body.id}`,
      edit
    );
    assert.equal(edited.status, 200);
    assert.equal(edited.body.title, 'Chapter One');
  });

  test('an Owner deletes a Comment and a Moderator removes and restores one, each leaving a Tombstone', async () => {
    const author = await signUp('threadAuthor', 'author');
    const commenter = await signUp('commenter');
    // No API mints an admin: registration reaches only user and author, and
    // only an existing superadmin may set any other Role. So the account is
    // arranged through the model, and signs in through the API like anyone.
    await User.create({
      login: 'moderator',
      email: 'moderator@example.com',
      password: PASSWORD,
      firstName: 'Mona',
      lastName: 'Moderator',
      status: 'active',
      role: 'admin',
    });
    const moderator = await signIn('moderator');

    // A Draft book takes no comments.
    const book = await createBook(author, 'Open Letters');
    assert.equal(
      (
        await author.browser.send('PATCH', `/books/${book.id}`, {
          status: 'in_progress',
        })
      ).status,
      200
    );

    const post = async (text: string) => {
      const { status, body } = await commenter.browser.send<PublicComment>(
        'POST',
        '/comments',
        { bookId: book.id, text }
      );
      assert.equal(status, 201);
      return body;
    };
    const readThread = async () => {
      const { body } = await openBrowser().send<{
        items: CommentWithAuthor[];
      }>('GET', `/comments?bookId=${book.id}`);
      return new Map(body.items.map((comment) => [comment.id, comment]));
    };

    const withdrawn = await post('I take it back');
    // The Book's own Co-author is not the Comment's Owner.
    assertRefused(
      await author.browser.send('DELETE', `/comments/${withdrawn.id}`),
      'You may only change your own comments'
    );
    assert.equal(
      (await commenter.browser.send('DELETE', `/comments/${withdrawn.id}`))
        .status,
      204
    );

    const moderated = await post('Out of line');
    assert.equal(
      (await moderator.browser.send('DELETE', `/comments/${moderated.id}`))
        .status,
      204
    );

    const thread = await readThread();
    // Both kinds withhold the text and the Owner alike.
    for (const [id, tombstone] of [
      [withdrawn.id, 'deleted'],
      [moderated.id, 'removed'],
    ] as const) {
      const shown = thread.get(id);
      assert.ok(shown, `comment ${id} is still in its thread`);
      assert.equal(shown.tombstone, tombstone);
      assert.equal(shown.text, '');
      assert.equal(shown.userId, null);
      assert.equal(shown.author, null);
    }

    const restored = await moderator.browser.send<PublicComment>(
      'POST',
      `/comments/${moderated.id}/restore`
    );
    assert.equal(restored.status, 200);
    assert.equal(restored.body.tombstone, null);
    assert.equal(restored.body.text, 'Out of line');
    assert.equal(restored.body.userId, commenter.user.id);
  });

  test('an Owner switches their own Role from user to author, and no further', async () => {
    const { browser, user } = await signUp('roleSwitcher');
    assert.equal(user.role, 'user');

    const switched = await browser.send<PublicUser>(
      'PATCH',
      `/users/${user.id}/role`,
      { role: 'author' }
    );
    assert.equal(switched.status, 200);
    assert.equal(switched.body.role, 'author');

    assertRefused(
      await browser.send('PATCH', `/users/${user.id}/role`, { role: 'admin' }),
      'You may not set that role'
    );

    // The session resolves its account from the row on every request, so this
    // reads back what updateRole stored.
    const me = await browser.send<PublicUser>('GET', '/auth/me');
    assert.equal(me.body.role, 'author');
  });

  test('a Draft book is hidden from a Guest and readable by its Co-author', async () => {
    const author = await signUp('draftAuthor', 'author');
    const book = await createBook(author, 'Unfinished');
    assert.equal(book.status, 'draft');

    // Hidden is the same 404 as missing, so the refusal confirms nothing.
    const guest = openBrowser();
    assert.equal((await guest.send('GET', `/books/${book.id}`)).status, 404);

    const own = await author.browser.send<BookDetail>(
      'GET',
      `/books/${book.id}`
    );
    assert.equal(own.status, 200);
    assert.equal(own.body.status, 'draft');
  });

  test('a co-author uploads a book cover through the real CSRF handshake, and reads it back as WebP', async () => {
    const author = await signUp('coverAuthor', 'author');
    const book = await createBook(author, 'Cover Test');
    // GET /cover is filtered through the same Draft visibility as everything
    // else, so publish it first and read it back as a guest would.
    assert.equal(
      (
        await author.browser.send('PATCH', `/books/${book.id}`, {
          status: 'in_progress',
        })
      ).status,
      200
    );

    const cover = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#336699' },
    })
      .jpeg()
      .toBuffer();

    const upload = await fetch(`${base}/api/books/${book.id}/cover`, {
      method: 'PUT',
      headers: {
        'content-type': 'image/jpeg',
        origin: trustedOrigin,
        cookie: author.browser.cookieHeader(),
        [XSRF_HEADER_NAME]: author.browser.xsrfToken(),
      },
      body: cover,
    });
    assert.equal(upload.status, 200);

    const read = await fetch(`${base}/api/books/${book.id}/cover`);
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('content-type'), 'image/webp');
    const bytes = Buffer.from(await read.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 600);
    assert.equal(metadata.height, 900);
  });
});
