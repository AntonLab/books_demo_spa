import { act } from '@testing-library/react';
import { NOTIFICATION_STREAM_EVENT } from 'shared';
import {
  NOTIFICATION_STREAM_RETRY_MS,
  useNotificationStream,
} from './notificationStream';
import { queryKeys } from './keys';
import { renderHookWithProviders } from '../test/renderWithProviders';
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

const renderStream = (userId = 3) => {
  const onNotification = jest.fn();
  const rendered = renderHookWithProviders(() =>
    useNotificationStream(userId, onNotification)
  );
  const invalidate = jest.spyOn(rendered.queryClient, 'invalidateQueries');
  return { ...rendered, onNotification, invalidate };
};

afterEach(() => {
  jest.useRealTimers();
});

describe('useNotificationStream', () => {
  it('opens one stream while mounted and closes it on unmount', () => {
    const { unmount } = renderStream();

    expect(FakeEventSource.instances).toHaveLength(1);
    const source = FakeEventSource.latest();
    unmount();

    expect(source.readyState).toBe(FakeEventSource.CLOSED);
  });

  it('refreshes the account’s notifications and hands the event on', () => {
    const { onNotification, invalidate } = renderStream(3);

    act(() => {
      FakeEventSource.latest().emit(NOTIFICATION_STREAM_EVENT, newChapter);
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.notifications(3),
    });
    expect(onNotification).toHaveBeenCalledWith(newChapter);
  });

  it('asks for the session again when the stream is closed, and retries once after the delay', () => {
    jest.useFakeTimers();
    const { invalidate } = renderStream();

    act(() => {
      FakeEventSource.latest().fail(FakeEventSource.CLOSED);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.session });
    // No reconnect loop: nothing new until the delay has passed.
    act(() => {
      jest.advanceTimersByTime(NOTIFICATION_STREAM_RETRY_MS - 1);
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('leaves a stream the browser is retrying to the browser', () => {
    jest.useFakeTimers();
    const { invalidate } = renderStream();

    act(() => {
      FakeEventSource.latest().fail(FakeEventSource.CONNECTING);
      jest.advanceTimersByTime(NOTIFICATION_STREAM_RETRY_MS);
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('drops a pending retry when it unmounts, as on a Lost session', () => {
    jest.useFakeTimers();
    const { unmount } = renderStream();

    act(() => {
      FakeEventSource.latest().fail(FakeEventSource.CLOSED);
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(NOTIFICATION_STREAM_RETRY_MS);
    });

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  // renderHookWithProviders takes no initialProps, so the account id is a
  // variable the hook closes over.
  it('moves to a new stream when the account changes', () => {
    const onNotification = jest.fn();
    let userId = 3;
    const { rerender } = renderHookWithProviders(() =>
      useNotificationStream(userId, onNotification)
    );
    const first = FakeEventSource.latest();

    userId = 4;
    rerender();

    expect(first.readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});
