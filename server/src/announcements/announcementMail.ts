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

// A title only has its edges trimmed (see the shared schema), so a stored
// CR/LF would otherwise reach the SMTP Subject header verbatim and let it
// carry a forged header (e.g. Bcc). Collapsing control characters here, once,
// before any title reaches the subject or body, closes that off for every
// caller of this module.
// \p{Cc} is the Unicode control-character category (CR, LF and the rest of
// C0/C1) — spelled this way, not as literal control bytes, so the pattern
// itself stays clean of the characters it strips.
const clean = (text: string): string => text.replace(/\p{Cc}+/gu, ' ');

const cleanChapter = (chapter: AnnouncedChapter): AnnouncedChapter => ({
  ...chapter,
  bookTitle: clean(chapter.bookTitle),
  chapterTitle: clean(chapter.chapterTitle),
});

const cleanBook = (book: AnnouncedBook): AnnouncedBook => ({
  ...book,
  bookTitle: clean(book.bookTitle),
  seriesTitle: clean(book.seriesTitle),
});

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
  const chapters = news.chapters.map(cleanChapter);
  const books = news.books.map(cleanBook);
  const lines = [
    ...books.flatMap((book) => [
      `New book in ${book.seriesTitle}: ${book.bookTitle}`,
      link(appBaseUrl, `/books/${book.bookId}`),
    ]),
    ...chapters.flatMap((chapter) => [
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
  return {
    to,
    subject: subjectOf({ chapters, books }),
    text: lines.join('\n'),
  };
}
