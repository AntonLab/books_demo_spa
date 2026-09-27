import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  AnnouncedBook,
  AnnouncedChapter,
} from '../repositories/announcementRepository.ts';
import { composeAnnouncementMail } from './announcementMail.ts';

const BASE = 'https://books.example.com';

const tideBell: AnnouncedChapter = {
  bookId: 3,
  bookTitle: 'The Glass Harbour',
  chapterId: 41,
  chapterTitle: 'The Tide Bell',
};
const lowWater: AnnouncedChapter = {
  bookId: 3,
  bookTitle: 'The Glass Harbour',
  chapterId: 42,
  chapterTitle: 'Low Water',
};
const nightbusReturns: AnnouncedBook = {
  bookId: 7,
  bookTitle: 'The Nightbus Returns',
  seriesId: 2,
  seriesTitle: 'The Nightbus Files',
};
const nightbusAgain: AnnouncedBook = {
  bookId: 8,
  bookTitle: 'The Nightbus, Again',
  seriesId: 2,
  seriesTitle: 'The Nightbus Files',
};

const FOOTER = [
  '',
  'You get these emails because you added these to your Favorites.',
  'Turn them off in your profile:',
  'https://books.example.com/profile#email-notifications',
];

test('one New chapter is named in the subject and linked in the body', () => {
  assert.deepEqual(
    composeAnnouncementMail(
      'reader@example.com',
      { chapters: [tideBell], books: [] },
      BASE
    ),
    {
      to: 'reader@example.com',
      subject: 'New chapter: The Glass Harbour — The Tide Bell',
      text: [
        'New chapter of The Glass Harbour: The Tide Bell',
        'https://books.example.com/books/3/chapters/41',
        ...FOOTER,
      ].join('\n'),
    }
  );
});

test('one New book is named with its Series', () => {
  const mail = composeAnnouncementMail(
    'reader@example.com',
    { chapters: [], books: [nightbusReturns] },
    BASE
  );

  assert.equal(
    mail.subject,
    'New book in The Nightbus Files: The Nightbus Returns'
  );
  assert.equal(
    mail.text,
    [
      'New book in The Nightbus Files: The Nightbus Returns',
      'https://books.example.com/books/7',
      ...FOOTER,
    ].join('\n')
  );
});

test('several New chapters are counted in the subject and each listed', () => {
  const mail = composeAnnouncementMail(
    'reader@example.com',
    { chapters: [tideBell, lowWater], books: [] },
    BASE
  );

  assert.equal(mail.subject, '2 new chapters in your Favorites');
  assert.equal(
    mail.text,
    [
      'New chapter of The Glass Harbour: The Tide Bell',
      'https://books.example.com/books/3/chapters/41',
      'New chapter of The Glass Harbour: Low Water',
      'https://books.example.com/books/3/chapters/42',
      ...FOOTER,
    ].join('\n')
  );
});

test('several New books are counted in the subject', () => {
  assert.equal(
    composeAnnouncementMail(
      'reader@example.com',
      { chapters: [], books: [nightbusReturns, nightbusAgain] },
      BASE
    ).subject,
    '2 new books in your Favorites'
  );
});

test('New chapters and New books together are counted apart, New books listed first', () => {
  const one = composeAnnouncementMail(
    'reader@example.com',
    { chapters: [tideBell], books: [nightbusReturns] },
    BASE
  );
  assert.equal(one.subject, '1 new chapter and 1 new book in your Favorites');
  assert.equal(
    one.text,
    [
      'New book in The Nightbus Files: The Nightbus Returns',
      'https://books.example.com/books/7',
      'New chapter of The Glass Harbour: The Tide Bell',
      'https://books.example.com/books/3/chapters/41',
      ...FOOTER,
    ].join('\n')
  );

  assert.equal(
    composeAnnouncementMail(
      'reader@example.com',
      {
        chapters: [tideBell, lowWater],
        books: [nightbusReturns, nightbusAgain],
      },
      BASE
    ).subject,
    '2 new chapters and 2 new books in your Favorites'
  );
});

test('a base URL with a trailing slash links without a doubled slash', () => {
  const mail = composeAnnouncementMail(
    'reader@example.com',
    { chapters: [tideBell], books: [] },
    'https://books.example.com/'
  );

  assert.match(
    mail.text,
    /^https:\/\/books\.example\.com\/books\/3\/chapters\/41$/m
  );
  assert.match(
    mail.text,
    /^https:\/\/books\.example\.com\/profile#email-notifications$/m
  );
});

test('a CR/LF smuggled in a title cannot inject a header into the subject', () => {
  const forged: AnnouncedChapter = {
    ...tideBell,
    chapterTitle: 'The Tide Bell\r\nBcc: x@example.com',
  };

  const mail = composeAnnouncementMail(
    'reader@example.com',
    { chapters: [forged], books: [] },
    BASE
  );

  assert.doesNotMatch(mail.subject, /[\r\n]/);
});
