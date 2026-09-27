import type { MailMessage } from '../delivery/mailDelivery.ts';
import type {
  AnnouncedBook,
  AnnouncedChapter,
} from '../repositories/announcementRepository.ts';

interface AnnouncementNews {
  chapters: readonly AnnouncedChapter[];
  books: readonly AnnouncedBook[];
}

// The paths are the client's routes, and the anchor is the id part 3 gives
// the profile's "Email notifications" switch. Each email must link to it: it
// is the only way out, as there is no unsubscribe token.
const link = (appBaseUrl: string, path: string): string =>
  new URL(path, appBaseUrl).toString();

const counted = (count: number, noun: string): string =>
  `${count} new ${noun}${count === 1 ? '' : 's'}`;

function subjectOf({ chapters, books }: AnnouncementNews): string {
  const [chapter] = chapters;
  const [book] = books;
  if (chapter && chapters.length === 1 && books.length === 0) {
    return `New chapter: ${chapter.bookTitle} — ${chapter.chapterTitle}`;
  }
  if (book && books.length === 1 && chapters.length === 0) {
    return `New book in ${book.seriesTitle}: ${book.bookTitle}`;
  }
  if (books.length === 0) {
    return `${counted(chapters.length, 'chapter')} in your Favorites`;
  }
  if (chapters.length === 0) {
    return `${counted(books.length, 'book')} in your Favorites`;
  }
  return `${counted(chapters.length, 'chapter')} and ${counted(books.length, 'book')} in your Favorites`;
}

export function composeAnnouncementMail(
  to: string,
  news: AnnouncementNews,
  appBaseUrl: string
): MailMessage {
  const lines = [
    ...news.books.flatMap((book) => [
      `New book in ${book.seriesTitle}: ${book.bookTitle}`,
      link(appBaseUrl, `/books/${book.bookId}`),
    ]),
    ...news.chapters.flatMap((chapter) => [
      `New chapter of ${chapter.bookTitle}: ${chapter.chapterTitle}`,
      link(
        appBaseUrl,
        `/books/${chapter.bookId}/chapters/${chapter.chapterId}`
      ),
    ]),
    '',
    'You get these emails because you added these to your Favorites.',
    'Turn them off in your profile:',
    link(appBaseUrl, '/profile#email-notifications'),
  ];
  return { to, subject: subjectOf(news), text: lines.join('\n') };
}
