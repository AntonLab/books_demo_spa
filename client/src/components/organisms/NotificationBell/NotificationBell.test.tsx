import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationBell } from './NotificationBell';
import { renderWithProviders } from '@/test/renderWithProviders';
import { formatDateTime } from '@/format/date';
import * as notificationsApi from '@/api/notifications';
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
  isRead: false,
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
  isRead: false,
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
  isRead: false,
  createdAt: '2026-09-26T10:00:00.000Z',
  ...overrides,
});

const page = (items: PublicNotification[]) => ({
  items,
  total: items.length,
  unread: items.filter((item) => !item.isRead).length,
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
        notification({ id: 3, isRead: true }),
      ])
    );
    renderWithProviders(<NotificationBell userId={3} />);

    expect(
      await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    ).toBeInTheDocument();
  });

  it('says nothing is unread when nothing is', async () => {
    mockedNotifications.listNotifications.mockResolvedValue(
      page([notification({ isRead: true })])
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
          notification({ id: 2, isRead: true }),
          notification({ id: 3 }),
        ])
      )
      .mockResolvedValue(
        page([
          notification({ id: 1, isRead: true }),
          notification({ id: 2, isRead: true }),
          notification({ id: 3, isRead: true }),
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
    mockedNotifications.listNotifications.mockResolvedValue(
      page([notification({ isRead: true })])
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
