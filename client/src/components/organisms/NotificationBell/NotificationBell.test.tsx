import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { NOTIFICATION_READ_TTL_MS, NOTIFICATION_STREAM_EVENT } from 'shared';
import { NotificationBell } from './NotificationBell';
import { COLLAPSE_MS } from './collapse';
import { renderWithProviders } from '@/test/renderWithProviders';
import { formatDateTime } from '@/format/date';
import * as notificationsApi from '@/api/notifications';
import { FakeEventSource } from '@/test/eventSource';
import type {
  CreditNotification,
  NewBookNotification,
  NewChapterNotification,
  PublicNotification,
} from '@/types/api';

jest.mock('@/api/notifications');

const mockedNotifications = jest.mocked(notificationsApi);

const notification = (
  overrides: Partial<CreditNotification>
): CreditNotification => ({
  id: 1,
  kind: 'co_author_added',
  work: { type: 'book', id: 7, title: 'The Glass Harbour' },
  actor: { kind: 'co_author', name: 'Margaret Hale' },
  readAt: null,
  createdAt: '2026-09-12T10:00:00.000Z',
  ...overrides,
});

const newChapter = (
  overrides: Partial<NewChapterNotification>
): NewChapterNotification => ({
  id: 11,
  kind: 'new_chapter',
  work: { type: 'book', id: 7, title: 'The Glass Harbour' },
  chapter: { id: 70, title: 'The Tide Bell' },
  chapterCount: 1,
  readAt: null,
  createdAt: '2026-09-26T10:00:00.000Z',
  ...overrides,
});

const newBook = (
  overrides: Partial<NewBookNotification>
): NewBookNotification => ({
  id: 21,
  kind: 'new_book',
  work: { type: 'book', id: 9, title: 'The Nightbus Returns' },
  series: { id: 4, title: 'The Nightbus Files' },
  readAt: null,
  createdAt: '2026-09-26T10:00:00.000Z',
  ...overrides,
});

const page = (items: PublicNotification[]) => ({
  items,
  total: items.length,
  unread: items.filter((item) => item.readAt === null).length,
  limit: 20,
  offset: 0,
});

// A sentence is split across a link and the text around it, so it is matched
// on the innermost element that holds all of it.
const sentence = (text: string) =>
  screen.getByText(
    (_, element) =>
      element?.textContent === text &&
      [...element.children].every((child) => child.textContent !== text)
  );

beforeEach(() => {
  jest.resetAllMocks();
  mockedNotifications.markNotificationsRead.mockResolvedValue({ unread: 0 });
});

describe('NotificationBell', () => {
  it('shows how many notifications are unread', async () => {
    mockedNotifications.listNotifications.mockResolvedValue(
      page([
        notification({ id: 1 }),
        notification({ id: 2 }),
        notification({ id: 3, readAt: '2026-09-26T10:00:00.000Z' }),
      ])
    );
    renderWithProviders(<NotificationBell userId={3} />);

    expect(
      await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    ).toBeInTheDocument();
  });

  it('hides its tooltip while the popover is open', async () => {
    mockedNotifications.listNotifications.mockResolvedValue(page([]));
    renderWithProviders(<NotificationBell userId={3} />);
    const bell = await screen.findByRole('button', { name: 'Notifications' });

    await userEvent.hover(bell);
    await userEvent.click(bell);

    expect(await screen.findByText('No notifications yet.')).toBeVisible();
    await waitFor(() =>
      expect(
        document.querySelector('.ant-tooltip:not(.ant-tooltip-hidden)')
      ).toBeNull()
    );
  });

  it('says nothing is unread when nothing is', async () => {
    mockedNotifications.listNotifications.mockResolvedValue(
      page([notification({ readAt: '2026-09-26T10:00:00.000Z' })])
    );
    renderWithProviders(<NotificationBell userId={3} />);

    expect(
      await screen.findByRole('button', { name: 'Notifications' })
    ).toBeInTheDocument();
  });

  it('opening it lists every kind of notification in words, linking to works that still exist', async () => {
    mockedNotifications.listNotifications.mockResolvedValue(
      page([
        notification({ id: 1 }),
        notification({
          id: 2,
          kind: 'co_author_removed',
          work: { type: 'series', id: 4, title: 'The Nightbus Files' },
          actor: { kind: 'co_author', name: 'Nora Quinn' },
        }),
        notification({
          id: 3,
          kind: 'co_author_left',
          actor: { kind: 'co_author', name: 'Ivan Petrov' },
        }),
        notification({
          id: 4,
          kind: 'co_author_account_deleted',
          actor: { kind: 'deleted_account', name: null },
        }),
        notification({
          id: 5,
          kind: 'work_deleted',
          work: { type: 'book', id: null, title: 'Salt and Candlelight' },
          actor: { kind: 'moderator', name: null },
        }),
        notification({
          id: 6,
          kind: 'work_deleted',
          work: { type: 'series', id: null, title: 'Letters from Blackmoor' },
          actor: { kind: 'co_author', name: 'Margaret Hale' },
        }),
      ])
    );
    renderWithProviders(<NotificationBell userId={3} />);

    await userEvent.click(
      await screen.findByRole('button', { name: /^Notifications/ })
    );

    expect(
      await screen.findByText('Margaret Hale added you as a co-author of', {
        exact: false,
      })
    ).toBeInTheDocument();
    expect(
      sentence(
        'Margaret Hale added you as a co-author of the book “The Glass Harbour”.'
      )
    ).toBeInTheDocument();
    expect(
      sentence(
        'Nora Quinn removed you from the co-authors of the series “The Nightbus Files”.'
      )
    ).toBeInTheDocument();
    expect(
      sentence(
        'Ivan Petrov left the co-authors of the book “The Glass Harbour”.'
      )
    ).toBeInTheDocument();
    expect(
      sentence(
        'A deleted account is no longer a co-author of the book “The Glass Harbour”.'
      )
    ).toBeInTheDocument();
    expect(
      sentence('A moderator deleted the book “Salt and Candlelight”.')
    ).toBeInTheDocument();
    expect(
      sentence('Margaret Hale deleted the series “Letters from Blackmoor”.')
    ).toBeInTheDocument();

    expect(
      screen.getAllByRole('link', { name: '“The Glass Harbour”' })[0]
    ).toHaveAttribute('href', '/books/7');
    expect(
      screen.getByRole('link', { name: '“The Nightbus Files”' })
    ).toHaveAttribute('href', '/series/4/edit');
    // A deleted work is named, never linked.
    expect(
      screen.queryByRole('link', { name: '“Salt and Candlelight”' })
    ).toBeNull();
  });

  it('marks the unread ones read as it opens, and the count follows', async () => {
    mockedNotifications.listNotifications
      .mockResolvedValueOnce(
        page([
          notification({ id: 1 }),
          notification({ id: 2, readAt: '2026-09-26T10:00:00.000Z' }),
          notification({ id: 3 }),
        ])
      )
      .mockResolvedValue(
        page([
          notification({ id: 1, readAt: '2026-09-26T10:00:00.000Z' }),
          notification({ id: 2, readAt: '2026-09-26T10:00:00.000Z' }),
          notification({ id: 3, readAt: '2026-09-26T10:00:00.000Z' }),
        ])
      );
    renderWithProviders(<NotificationBell userId={3} />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    );

    await waitFor(() =>
      expect(mockedNotifications.markNotificationsRead).toHaveBeenCalledWith([
        1, 3,
      ])
    );
    expect(
      await screen.findByRole('button', { name: 'Notifications' })
    ).toBeInTheDocument();
  });

  it('asks the server to mark nothing when everything is already read', async () => {
    // Read just now: a row read over a minute ago is no longer shown.
    mockedNotifications.listNotifications.mockResolvedValue(
      page([notification({ readAt: new Date().toISOString() })])
    );
    renderWithProviders(<NotificationBell userId={3} />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Notifications' })
    );

    expect(
      await screen.findByText('The Glass Harbour', { exact: false })
    ).toBeInTheDocument();
    expect(mockedNotifications.markNotificationsRead).not.toHaveBeenCalled();
  });

  it('says so when there is nothing to show', async () => {
    mockedNotifications.listNotifications.mockResolvedValue(page([]));
    renderWithProviders(<NotificationBell userId={3} />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Notifications' })
    );

    expect(
      await screen.findByText('No notifications yet.')
    ).toBeInTheDocument();
  });

  it('words New chapter and New book notifications and links to what is new', async () => {
    mockedNotifications.listNotifications.mockResolvedValue(
      page([
        newChapter({}),
        newChapter({
          id: 12,
          work: { type: 'book', id: 8, title: 'Salt and Candlelight' },
          chapter: { id: 80, title: 'Low Water' },
          chapterCount: 3,
        }),
        newChapter({
          id: 13,
          work: { type: 'book', id: 5, title: 'Iron Orchard' },
          chapter: { id: null, title: 'Withdrawn' },
        }),
        newChapter({
          id: 14,
          work: { type: 'book', id: null, title: 'Gone Book' },
          chapter: { id: null, title: 'Gone Chapter' },
        }),
        newBook({}),
      ])
    );
    renderWithProviders(<NotificationBell userId={3} />);

    await userEvent.click(
      await screen.findByRole('button', { name: /^Notifications/ })
    );

    expect(
      await screen.findByText('The Tide Bell', { exact: false })
    ).toBeInTheDocument();
    expect(
      sentence('New chapter in the book “The Glass Harbour”: “The Tide Bell”.')
    ).toBeInTheDocument();
    expect(
      sentence(
        '3 new chapters in the book “Salt and Candlelight”, starting with “Low Water”.'
      )
    ).toBeInTheDocument();
    expect(
      sentence(
        'New book in the series “The Nightbus Files”: “The Nightbus Returns”.'
      )
    ).toBeInTheDocument();

    // A New chapter opens the first new Chapter; a New book opens the Book.
    expect(
      screen.getByRole('link', { name: '“The Tide Bell”' })
    ).toHaveAttribute('href', '/books/7/chapters/70');
    expect(screen.getByRole('link', { name: '“Low Water”' })).toHaveAttribute(
      'href',
      '/books/8/chapters/80'
    );
    expect(
      screen.getByRole('link', { name: '“The Nightbus Returns”' })
    ).toHaveAttribute('href', '/books/9');
    // A deleted Chapter falls back to its Book; a deleted Book links nowhere.
    expect(screen.getByRole('link', { name: '“Withdrawn”' })).toHaveAttribute(
      'href',
      '/books/5'
    );
    expect(screen.queryByRole('link', { name: '“Gone Chapter”' })).toBeNull();
  });

  it('dates each notification with the app date-time helper', async () => {
    mockedNotifications.listNotifications.mockResolvedValue(
      page([notification({ id: 1 })])
    );
    renderWithProviders(<NotificationBell userId={3} />);

    await userEvent.click(
      await screen.findByRole('button', { name: /^Notifications/ })
    );

    expect(
      await screen.findByText(formatDateTime('2026-09-12T10:00:00.000Z'))
    ).toBeInTheDocument();
  });
});

const NOW = Date.parse('2026-09-26T12:00:00.000Z');
const readAgo = (ms: number) => new Date(NOW - ms).toISOString();

describe('NotificationBell read expiry', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const openBell = async (items: PublicNotification[]) => {
    mockedNotifications.listNotifications.mockResolvedValue(page(items));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProviders(<NotificationBell userId={3} />);
    await user.click(
      await screen.findByRole('button', { name: /^Notifications/ })
    );
    return user;
  };

  it('drops a read row once readAt plus the TTL passes, and keeps the others', async () => {
    await openBell([
      notification({
        id: 1,
        readAt: readAgo(NOTIFICATION_READ_TTL_MS - 10_000),
      }),
      notification({
        id: 2,
        work: { type: 'book', id: 8, title: 'Salt and Candlelight' },
      }),
    ]);
    expect(
      await screen.findByText('The Glass Harbour', { exact: false })
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(10_000 + COLLAPSE_MS);
    });

    expect(
      screen.queryByText('The Glass Harbour', { exact: false })
    ).toBeNull();
    expect(
      screen.getByText('Salt and Candlelight', { exact: false })
    ).toBeInTheDocument();
  });

  it('keeps a read row until the TTL, not a moment before', async () => {
    await openBell([
      notification({
        id: 1,
        readAt: readAgo(NOTIFICATION_READ_TTL_MS - 10_000),
      }),
    ]);
    expect(
      await screen.findByText('The Glass Harbour', { exact: false })
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(9_999);
    });

    expect(
      screen.getByText('The Glass Harbour', { exact: false })
    ).toBeInTheDocument();
  });

  it('does not show a row that expired in the cache before the popover opened', async () => {
    await openBell([
      notification({
        id: 1,
        readAt: readAgo(NOTIFICATION_READ_TTL_MS + 5_000),
      }),
    ]);

    expect(
      await screen.findByText('No notifications yet.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('The Glass Harbour', { exact: false })
    ).toBeNull();
  });

  it('shows the empty state once the last row has gone', async () => {
    await openBell([
      notification({
        id: 1,
        readAt: readAgo(NOTIFICATION_READ_TTL_MS - 1_000),
      }),
    ]);
    expect(
      await screen.findByText('The Glass Harbour', { exact: false })
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1_000 + COLLAPSE_MS);
    });

    expect(screen.getByText('No notifications yet.')).toBeInTheDocument();
  });

  it('never drops an unread row, however long the popover stays open', async () => {
    await openBell([notification({ id: 1 })]);
    expect(
      await screen.findByText('The Glass Harbour', { exact: false })
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(10 * NOTIFICATION_READ_TTL_MS);
    });

    expect(
      screen.getByText('The Glass Harbour', { exact: false })
    ).toBeInTheDocument();
  });

  it('drops a row whose readAt is ahead of the browser clock within the TTL', async () => {
    // A browser clock behind the server must not keep the row up to TTL + skew.
    await openBell([notification({ id: 1, readAt: readAgo(-30_000) })]);
    expect(
      await screen.findByText('The Glass Harbour', { exact: false })
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(NOTIFICATION_READ_TTL_MS + COLLAPSE_MS);
    });

    expect(
      screen.queryByText('The Glass Harbour', { exact: false })
    ).toBeNull();
  });

  it('forgets a dismissed row once the list no longer holds it', async () => {
    await openBell([
      notification({
        id: 1,
        readAt: readAgo(NOTIFICATION_READ_TTL_MS - 1_000),
      }),
    ]);
    expect(
      await screen.findByText('The Glass Harbour', { exact: false })
    ).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1_000 + COLLAPSE_MS);
    });
    expect(screen.getByText('No notifications yet.')).toBeInTheDocument();

    // A push only triggers a refetch; its toast names another book so it never
    // matches the row under test.
    const refetch = () =>
      push(
        newChapter({
          id: 99,
          work: { type: 'book', id: 8, title: 'Salt and Candlelight' },
        })
      );

    // Still listed after a refetch: stays hidden.
    mockedNotifications.listNotifications.mockResolvedValue(
      page([
        notification({
          id: 1,
          readAt: readAgo(NOTIFICATION_READ_TTL_MS - 1_000),
        }),
      ])
    );
    refetch();
    await waitFor(() =>
      expect(mockedNotifications.listNotifications).toHaveBeenCalledTimes(2)
    );
    expect(screen.getByText('No notifications yet.')).toBeInTheDocument();

    // Purged by the server, then listed again under the same id: shows.
    mockedNotifications.listNotifications.mockResolvedValue(page([]));
    refetch();
    await waitFor(() =>
      expect(mockedNotifications.listNotifications).toHaveBeenCalledTimes(3)
    );
    mockedNotifications.listNotifications.mockResolvedValue(
      page([notification({ id: 1 })])
    );
    refetch();

    expect(
      await screen.findByText('The Glass Harbour', { exact: false })
    ).toBeInTheDocument();
  });

  it('clears the row timers when the popover closes', async () => {
    const user = await openBell([
      notification({
        id: 1,
        readAt: readAgo(NOTIFICATION_READ_TTL_MS - 10_000),
      }),
    ]);
    expect(
      await screen.findByText('The Glass Harbour', { exact: false })
    ).toBeInTheDocument();
    const whileOpen = jest.getTimerCount();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(jest.getTimerCount()).toBeLessThan(whileOpen));
  });
});

// Renders the current URL so a test can see where Open navigated to.
const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const push = (item: PublicNotification) => {
  act(() => {
    FakeEventSource.latest().emit(NOTIFICATION_STREAM_EVENT, item);
  });
};

describe('NotificationBell live toasts', () => {
  beforeEach(() => {
    mockedNotifications.listNotifications.mockResolvedValue(page([]));
  });

  it('toasts a pushed notification, refreshes the list, and opens what it points at', async () => {
    renderWithProviders(
      <>
        <NotificationBell userId={3} />
        <LocationProbe />
      </>
    );
    await waitFor(() =>
      expect(mockedNotifications.listNotifications).toHaveBeenCalledTimes(1)
    );

    push(newChapter({}));

    await waitFor(() =>
      expect(
        sentence(
          'New chapter in the book “The Glass Harbour”: “The Tide Bell”.'
        )
      ).toBeInTheDocument()
    );
    expect(screen.queryByText('New notification')).toBeNull();
    // The badge learns of it at once, not at the next 60 s poll.
    await waitFor(() =>
      expect(mockedNotifications.listNotifications).toHaveBeenCalledTimes(2)
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/books/7/chapters/70'
    );
  });

  it('updates the one toast when a New chapter grows, instead of stacking another', async () => {
    renderWithProviders(<NotificationBell userId={3} />);
    push(newChapter({}));
    await screen.findByRole('button', { name: 'Open' });

    // The pass merges a second Chapter into the same unread Notification and
    // pushes it again under the same id.
    push(newChapter({ chapterCount: 2 }));

    await waitFor(() =>
      expect(
        sentence(
          '2 new chapters in the book “The Glass Harbour”, starting with “The Tide Bell”.'
        )
      ).toBeInTheDocument()
    );
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(1);
  });

  it('toasts the credit kinds too, and offers no Open for a work that is gone', async () => {
    renderWithProviders(<NotificationBell userId={3} />);

    push(notification({}));

    await waitFor(() =>
      expect(
        sentence(
          'Margaret Hale added you as a co-author of the book “The Glass Harbour”.'
        )
      ).toBeInTheDocument()
    );

    push(
      notification({ id: 2, work: { type: 'book', id: null, title: 'Gone' } })
    );

    await waitFor(() =>
      expect(
        sentence('Margaret Hale added you as a co-author of the book “Gone”.')
      ).toBeInTheDocument()
    );
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(1);
  });
});
