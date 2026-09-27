import { NOTIFICATION_STREAM_EVENT } from 'shared';
import { openNotificationStream } from './notificationStream';
import { FakeEventSource } from '../test/eventSource';
import type { NewChapterNotification } from '../types/api';

const newChapter: NewChapterNotification = {
  id: 11,
  kind: 'new_chapter',
  work: { type: 'book', id: 7, title: 'The Glass Harbour' },
  chapter: { id: 70, title: 'The Tide Bell' },
  chapterCount: 1,
  isRead: false,
  createdAt: '2026-09-26T10:00:00.000Z',
};

const open = () => {
  const handlers = { onNotification: jest.fn(), onClosed: jest.fn() };
  const close = openNotificationStream(handlers);
  return { ...handlers, close, source: FakeEventSource.latest() };
};

describe('openNotificationStream', () => {
  it('opens the stream with the session cookie', () => {
    const { source } = open();

    expect(source.url).toBe('/api/notifications/stream');
    expect(source.withCredentials).toBe(true);
  });

  it('hands each notification event over, parsed', () => {
    const { source, onNotification } = open();

    source.emit(NOTIFICATION_STREAM_EVENT, newChapter);

    expect(onNotification).toHaveBeenCalledWith(newChapter);
  });

  it('ignores an event of another name', () => {
    const { source, onNotification } = open();

    source.emit('message', newChapter);

    expect(onNotification).not.toHaveBeenCalled();
  });

  it('reports a stream the browser gave up on, and not one it is retrying', () => {
    const { source, onClosed } = open();

    // A dropped connection: the browser reconnects by itself.
    source.fail(FakeEventSource.CONNECTING);
    expect(onClosed).not.toHaveBeenCalled();

    // A non-200 answer, such as the 401 of an ended session.
    source.fail(FakeEventSource.CLOSED);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('closes the stream through the function it returns', () => {
    const { source, close } = open();

    close();

    expect(source.readyState).toBe(FakeEventSource.CLOSED);
  });
});
