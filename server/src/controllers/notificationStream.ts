import type { RequestHandler } from 'express';
import type {
  OnlineConnection,
  OnlineRegistry,
} from '../online/onlineRegistry.ts';
import { actorOf } from '../repositories/visibility.ts';
import { SESSION_COOKIE_NAME } from '../sessionCookie.ts';
import { hashToken } from '../tokens.ts';
import { UnauthorizedError } from '../types/errors.ts';

// One Server-Sent Events stream per open tab. It carries only what the Online
// registry writes: the pass's notifications and its 30 s ping. The registry
// also decides when the session behind it has ended and closes it then.
export function createNotificationStreamHandler(
  registry: Pick<OnlineRegistry, 'add' | 'remove'>
): RequestHandler {
  return (req, res) => {
    const { id } = actorOf(req);
    // requireAuth has just resolved this cookie to a session; the check only
    // narrows the type.
    const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== 'string') throw new UnauthorizedError();

    // setHeader, not res.set(): Express's set() appends "; charset=utf-8" to
    // every text/* Content-Type, which SSE must not carry.
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    // webpack-dev-server compresses proxied responses by default, and a
    // compressed stream is held until its buffer fills; `compression` and
    // other transforming proxies pass a no-transform response through.
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // nginx buffers a proxied response by default, which would hold every
    // event back until the buffer filled.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': connected\n\n');

    const connection: OnlineConnection = {
      userId: id,
      tokenHash: hashToken(token),
      write: (chunk) => {
        res.write(chunk);
      },
      close: () => {
        res.end();
      },
    };
    registry.add(connection);
    // On the response, not the request: since Node 16 a request's 'close'
    // fires once its body is read, long before the client goes away.
    res.on('close', () => {
      registry.remove(connection);
    });
  };
}
