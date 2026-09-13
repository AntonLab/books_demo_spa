// Demo data for books_demo_spa: ten accounts, three authors' worth of
// published work, and the comment threads and likes that make the
// reader-facing pages look lived-in rather than empty.
//
// It writes through the models rather than the HTTP API. POST /api/auth/register
// can only mint a `user`, so the admin and the superadmin would need a back
// door anyway; every content write would need a live session cookie per
// persona; and several hundred chapter POSTs against a running server is slow
// and needs one started first. The generated payloads are still parsed by the
// same zod schemas the routes use, so nothing lands here that the API would
// have refused — only the identity fields those schemas deliberately withhold
// (the owner, and the role) are attached afterwards.
//
// Every count is drawn from a PRNG with a fixed seed, so two runs produce the
// same shape: book 7 has the same number of chapters today and tomorrow. Only
// the dates move, and only because they are anchored to the moment of the run
// (see PUBLICATION_WINDOW_DAYS) — a demo whose newest chapter is a year old
// looks like an abandoned project.
//
// Destructive by design: with --force it deletes every row in the eight content
// tables before inserting. Without --force it reports what it found and exits
// without writing.

import type { ModelStatic, Model, Transaction } from 'sequelize';
import { logger } from '../logger.ts';
import {
  Book,
  BookAuthor,
  Chapter,
  Comment,
  Like,
  Series,
  SeriesAuthor,
  User,
  initModels,
} from '../models/index.ts';
import { createBookSchema, type BookStatus } from '../types/book.ts';
import { createChapterSchema } from '../types/chapter.ts';
import { createCommentSchema, type Tombstone } from '../types/comment.ts';
import { createLikeSchema } from '../types/like.ts';
import type { UserRole } from '../types/permission.ts';
import { createSeriesSchema } from '../types/series.ts';
import { createUserSchema } from '../types/user.ts';
import { loadConfig, type AppConfig } from './config.ts';
import { ensureDatabase } from './ensureDatabase.ts';
import { createSequelize } from './sequelize.ts';

// The schema this seed is written for. Any other name needs --force, which is
// the same flag that authorises the delete — one gesture, two guards.
const DEMO_DATABASE = 'books_demo_spa';

// One password for all ten accounts. This is demo data on a developer's
// machine, not a credential: it is printed at the end of a run so nobody has
// to come back and read it out of this file.
const DEMO_PASSWORD = 'Password123!';

// Fixed, so the shape of the demo is reproducible. Change it to get a
// different — but equally repeatable — database.
const RNG_SEED = 1_357_911;

// The span each author's back catalogue is stretched over, ending a few days
// ago. The chapter cadence is *derived* from this rather than fixed: an author
// with ~190 chapters cannot publish one every 3-10 days inside 14 months, so
// the window wins and the gaps scale to fit (see layOutTimeline).
const PUBLICATION_WINDOW_DAYS = 430;

// MySQL's max_allowed_packet is the reason for a batch at all; 200 chapter
// rows of ~2 KB is ~400 KB, comfortably inside the 64 MB default and well
// inside a conservative 4 MB one.
const INSERT_BATCH = 200;

// How many books are credited to two authors rather than one (see shareBooks).
const SHARED_BOOK_COUNT = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Randomness                                                                 */
/* -------------------------------------------------------------------------- */

// mulberry32: a 32-bit PRNG that fits in five lines and needs no dependency.
// Math.random cannot be seeded, which is the whole requirement here.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface Rng {
  float(min: number, max: number): number;
  // Inclusive at both ends: the ranges in the brief are written that way
  // ("20-24 chapters" includes both).
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  // Distinct members, which is what the unique indexes on `likes` require of
  // the accounts liking one target.
  sample<T>(items: readonly T[], count: number): T[];
  shuffle<T>(items: readonly T[]): T[];
  chance(probability: number): boolean;
}

function createRng(seed: number): Rng {
  const next = mulberry32(seed);

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  return {
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    sample: (items, count) => shuffle(items).slice(0, count),
    shuffle,
    chance: (probability) => next() < probability,
  };
}

/* -------------------------------------------------------------------------- */
/* Content banks                                                              */
/* -------------------------------------------------------------------------- */

interface Genre {
  // A pool; each book and series takes 3-5. Two tags appear in more than one
  // genre on purpose, so ?tag= returns more than one author's work.
  tags: readonly string[];
  seriesTitles: readonly string[];
  // Long enough for the maximum an author can reach: 2 series x 5 books plus
  // 3 standalone books is 13.
  bookTitles: readonly string[];
  chapterAdjectives: readonly string[];
  chapterNouns: readonly string[];
  sentences: readonly string[];
}

const GOTHIC: Genre = {
  tags: ['gothic', 'victorian', 'mystery', 'slow-burn', 'manor', 'epistolary'],
  seriesTitles: ['The Ashgrove Chronicles', 'Letters from Blackmoor'],
  bookTitles: [
    'The Glass Harbour',
    'A Winter at Ashgrove',
    'The Cormorant Stair',
    'Salt and Candlelight',
    'The Quiet Wing',
    'Nine Rooms Facing North',
    'The Widow of Blackmoor',
    'A Debt of Rain',
    'The Locked Orangery',
    'Frost on the Iron Gate',
    "The Lamplighter's Daughter",
    'A House Without Mirrors',
    'The Long Carriage Road',
    'Ash and Aspidistra',
  ],
  chapterAdjectives: [
    'Empty',
    'Locked',
    'Second',
    'Borrowed',
    'Quiet',
    'Hollow',
    'Narrow',
    'Silvered',
    'Bitter',
    'Unlit',
    'Distant',
    'Patient',
    'Crooked',
    'Faded',
    'Northern',
    'Late',
  ],
  chapterNouns: [
    'Stair',
    'Letter',
    'Lantern',
    'Orangery',
    'Frost',
    'Corridor',
    'Bell',
    'Inventory',
    'Threshold',
    'Ledger',
    'Garden',
    'Carriage',
    'Window',
    'Tide',
    'Signature',
    'Portrait',
    'Kitchen',
    'Mourning',
  ],
  sentences: [
    'The house had been shut for eleven years, and it had learned to keep its own counsel.',
    'Rain came off the moor in long grey sheets that made the windows useless.',
    'She counted the candles twice before she trusted herself to speak.',
    'Every door on the north corridor opened inward, which struck her as a decision rather than an accident.',
    'The letter was signed with an initial she had spent a decade trying to forget.',
    'There were forty-one keys on the ring and only thirty-eight locks in the house.',
    'He spoke of the estate the way other men spoke of a debt they intended never to settle.',
    'The frost had got into the orangery and taken the lemon trees with it.',
    'Someone had been in the library, and had been careful enough to leave the dust undisturbed.',
    'She wrote the date at the top of the page and then sat looking at it for a long while.',
    'The bell in the servants’ passage rang once, at an hour when nobody should have been pulling it.',
    'Her aunt believed that grief, properly managed, could be made to keep indefinitely.',
    'The portrait had been turned to face the wall, and the nail was still warm from the moving.',
    'Gulls went over the roof all morning, complaining about the weather on her behalf.',
    'He had the habit of answering a question three sentences after it was asked.',
    'The inventory listed a silver service that no living person in the house had ever seen.',
    'Outside, the carriage road ran two miles without a single turning, as if daring anyone to leave.',
    'She learned to read the household by its noises, and to distrust the quiet ones most.',
    'The fire took badly, the chimney having its own opinions about the wind.',
    'There was salt on the inside of the glass, which meant the storm had been worse than admitted.',
    'His signature had changed between the first page and the last, and not in the way a tired hand changes.',
    'The steward kept two ledgers and was scrupulous in both.',
    'She had not expected the village to be kind, and it was not, and she was grateful for the honesty.',
    'A single lamp burned in the west wing every night, and no one would say who lit it.',
    'The tide came up to the wall at three and went out again as though embarrassed.',
    'He returned the book without comment, which was itself a kind of comment.',
    'The mourning rings had been ordered before the funeral, which is faster than sorrow usually moves.',
    'She found the second stair by feel, in the dark, exactly where the plans said there was none.',
    'There is a particular silence to a room that has just stopped being spoken in.',
    'By the end of the week she had stopped pretending she meant to go home.',
    'The gate had been painted over so many times that the iron beneath it was a rumour.',
    'They dined at seven, and the empty place at the head of the table was laid regardless.',
  ],
};

const HARD_SF: Genre = {
  tags: [
    'hard-sf',
    'space',
    'first-contact',
    'mystery',
    'orbital',
    'generation-ship',
  ],
  seriesTitles: ['The Kepler Ledger', 'Cold Equations of Mars'],
  bookTitles: [
    'The Slow Light',
    'Orbit of Small Mercies',
    'Dust on the Third Deck',
    'A Signal Worth Keeping',
    'The Iron Aphelion',
    'Nine Hours to Perihelion',
    'The Last Quiet Vacuum',
    'Ceres Is Not Listening',
    'The Argument from Silence',
    'Half a Gravity',
    'The Long Deceleration',
    'Telemetry for the Dead',
    'A Map of Cold Places',
    'The Second Crew',
  ],
  chapterAdjectives: [
    'Cold',
    'Quiet',
    'Seventh',
    'Redundant',
    'Nominal',
    'Frozen',
    'Distant',
    'Failing',
    'Silent',
    'Hard',
    'Empty',
    'Faint',
    'Precise',
    'Borrowed',
    'Outer',
    'Late',
  ],
  chapterNouns: [
    'Burn',
    'Telemetry',
    'Airlock',
    'Vacuum',
    'Signal',
    'Deck',
    'Aphelion',
    'Checklist',
    'Beacon',
    'Gravity',
    'Transit',
    'Coolant',
    'Manifest',
    'Horizon',
    'Silence',
    'Window',
    'Spectrum',
    'Rotation',
  ],
  sentences: [
    'The burn lasted four minutes and eleven seconds, and every one of them was accounted for in advance.',
    'Telemetry arrived eighty-three minutes late, which was exactly as late as physics required.',
    'She ran the checklist twice, not because she doubted it but because the second run is the one that catches you.',
    'The coolant loop had been losing a gram a day for two years before anyone thought to add it up.',
    'Nothing about the signal was artificial except its timing, and timing was enough.',
    'On the third deck the air smelled of hot dust, which meant a filter had given up quietly.',
    'He had trained for this failure in simulation nine times and had never once liked the ending.',
    'The ship rotated at a fifth of a gravity, and after six months her knees had opinions about it.',
    'They argued about the orbit for an hour, then deferred to the numbers, as they always did.',
    'Vacuum is not silent; it simply refuses to carry anything you would want to hear.',
    'The manifest listed eleven crew and twelve pressure suits, and nobody had ever explained the spare.',
    'Deceleration began on schedule, and the whole hull began to speak in a register she had never heard.',
    'A beacon that repeats is a machine; a beacon that varies is a question.',
    'The window frosted over from the inside, which is the wrong direction for frost.',
    'He wrote the log entry in the flat voice of someone who expects to be read by a board of inquiry.',
    'Consensus on the bridge lasted until the second data packet contradicted the first.',
    'Every redundant system had a single point of failure, and it was usually the cable tray.',
    'She had seen the spectrum before, in a textbook, described as impossible under stellar conditions.',
    'The far side of the station kept a full day of darkness, and the crew went there to be unobserved.',
    'At aphelion the sun was a bright nail head and nothing more.',
    'The reactor ran nominal, which is the most frightening word in the engineering vocabulary.',
    'They had eleven hours of margin and spent three of them deciding how to spend the rest.',
    'The first-contact protocol assumed someone would answer, and said nothing about what to do when nobody did.',
    'Radiation exposure was within limits, the way a cliff edge is within walking distance.',
    'He counted the hull ticks in the dark and reached a number he refused to write down.',
    'The transit window closed at 0400 and would not reopen for nineteen months.',
    'Half the instruments agreed, which is worse than none of them agreeing.',
    'She put her hand flat on the bulkhead and felt the whole ship working on the other side of it.',
    'Their orders had been written by someone eleven light-minutes and four years away.',
    'The silence after the antenna stopped was the loudest thing on board.',
    'Gravity, when they finally had it again, felt like an accusation.',
    'No one had ever tested the airlock against a pressure differential in that direction.',
  ],
};

const URBAN_FANTASY: Genre = {
  tags: ['urban-fantasy', 'magic', 'detective', 'slow-burn', 'city', 'wards'],
  seriesTitles: ['The Nightbus Files', 'Wardens of the Third Ward'],
  bookTitles: [
    'Salt Circles and Streetlights',
    'The Tuesday Ghost',
    'A Charm for Bad Tenants',
    'The Rent Collector',
    'Nine Wards of Rain',
    'The Pawnshop at Dawn',
    'Bones of the Old Canal',
    'A Small Honest Curse',
    'The Locksmith of Vine Street',
    'Every Door Says Yes',
    'The Midnight Ledger',
    'A Cat With Opinions',
    'The Quiet Hex',
    'Under the Tram Bridge',
  ],
  chapterAdjectives: [
    'Borrowed',
    'Crooked',
    'Third',
    'Cheap',
    'Quiet',
    'Unlucky',
    'Second',
    'Wet',
    'Small',
    'Honest',
    'Late',
    'Broken',
    'Neon',
    'Patient',
    'Old',
    'Bitter',
  ],
  chapterNouns: [
    'Ward',
    'Streetlight',
    'Contract',
    'Pawnshop',
    'Tram',
    'Circle',
    'Tenant',
    'Ledger',
    'Doorway',
    'Charm',
    'Alley',
    'Receipt',
    'Canal',
    'Keyring',
    'Rain',
    'Favour',
    'Bargain',
    'Landlord',
  ],
  sentences: [
    'The ward on the front door had been repainted so often it no longer matched the building.',
    'Nothing in this city is free, but a surprising amount of it is cheap.',
    'She paid the fare in coins because the nightbus does not take anything that leaves a record.',
    'The contract ran to two pages and the interesting part was the paper.',
    'He kept his charms in a tobacco tin, sorted by how much trouble each one had caused.',
    'Rain got into the salt circle at about two in the morning and that was the end of the quiet.',
    'The pawnshop opened at dawn and closed whenever the owner decided it had.',
    'Her landlord was technically a person, and she had stopped pressing for detail beyond that.',
    'Magic in this part of town is mostly plumbing: old, patched, and nobody wants to look behind the wall.',
    'The tram went over the bridge and for six seconds the whole carriage smelled of the canal.',
    'A favour owed in this neighbourhood accrues interest, and the interest is not money.',
    'He wrote the address on his hand because paper has a way of being read by the wrong people.',
    'The cat had opinions about the client and, as usual, the cat was right.',
    'Streetlights along Vine went out one by one behind her, politely, the way a room stops talking.',
    'She had been a detective for nine years and a warden for two, and the paperwork was worse on the second job.',
    'Every door in the building said yes, which is the single worst thing a door can say.',
    'The ledger recorded debts in a hand that changed with the phase of the moon.',
    'There was a small honest curse on the till and a large dishonest one on the manager.',
    'He drank the coffee for the warmth and not out of any hope about the coffee.',
    'The ghost came on Tuesdays, and was punctual in a way the living rarely manage.',
    'Nobody warded the basement, because nobody had gone down there in thirty years to notice.',
    'She traced the circle in chalk, then went over it in salt, then went over that in swearing.',
    'The receipt was for one item, dated nineteen years ago, and it was still warm.',
    'Half the wards in the Third Ward were keeping something out and the other half were keeping something in.',
    'He asked what it would cost and she told him, and he paid it anyway, which told her plenty.',
    'The canal gives things back eventually, but never in the condition they went in.',
    'A locksmith who works after midnight is not really in the business of locks.',
    'Neon from the takeaway turned the alley the colour of a bad decision.',
    'She had a rule about bargains struck before breakfast and had already broken it twice that week.',
    'The keyring held eleven keys and she could account for six.',
    'Under the tram bridge the air went thin, the way it does at altitude or near a very old promise.',
    'He looked at the sigil for a long moment and said the word landlords use for structural damage.',
  ],
};

// A book's annotation and a series' blurb are drawn from the same banks as the
// prose: the point is that a book page reads coherently, not that the blurb is
// separately authored.
function description(rng: Rng, genre: Genre, count: number): string {
  return rng.sample(genre.sentences, count).join(' ');
}

function chapterTitle(rng: Rng, genre: Genre): string {
  const adjective = rng.pick(genre.chapterAdjectives);
  const noun = rng.pick(genre.chapterNouns);

  // Three shapes rather than one, so twenty-odd titles in a row do not all
  // scan identically.
  switch (rng.int(0, 2)) {
    case 0:
      return `The ${adjective} ${noun}`;
    case 1:
      return `${noun} and ${rng.pick(genre.chapterNouns)}`;
    default:
      return `A ${adjective} ${noun}`;
  }
}

// Deduplicated within one book only: a repeat across two books of a
// thirteen-book catalogue is plausible, a repeat inside one book is a bug. The
// attempt cap is what stops a small noun pool from looping forever.
function chapterTitles(rng: Rng, genre: Genre, count: number): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();

  while (titles.length < count) {
    let candidate = chapterTitle(rng, genre);
    for (let attempt = 0; seen.has(candidate) && attempt < 20; attempt += 1) {
      candidate = chapterTitle(rng, genre);
    }
    seen.add(candidate);
    titles.push(candidate);
  }

  return titles;
}

// ~4-6 paragraphs of 4-5 sentences: around 2 KB, which is enough for the
// reader page to scroll and for the layout to be judged, without putting 20 KB
// a row into a MEDIUMTEXT column several hundred times over.
//
// Dealt from one shuffled deck for the whole chapter rather than sampled per
// paragraph: a sentence appearing twice in the same chapter is the kind of
// thing a reader notices immediately. Six paragraphs of five stays inside a
// 32-sentence bank; the loop only refills if a bank shrinks or the ranges grow.
function chapterText(rng: Rng, genre: Genre): string {
  const sizes = Array.from({ length: rng.int(4, 6) }, () => rng.int(4, 5));
  const needed = sizes.reduce((sum, size) => sum + size, 0);

  const deck: string[] = [];
  while (deck.length < needed) {
    deck.push(...rng.shuffle(genre.sentences));
  }

  let taken = 0;
  return sizes
    .map((size) => deck.slice(taken, (taken += size)).join(' '))
    .join('\n\n');
}

const TOP_LEVEL_COMMENTS: readonly string[] = [
  'Found this last week and read the whole thing in two evenings. The pacing in the middle third is doing something clever.',
  'I keep coming back to the chapter where nothing happens. Somehow that is the one that stuck.',
  'The setting does so much work here without ever stopping to explain itself. More of this please.',
  'Started sceptical, stayed for the dialogue. Whoever taught this author to write silences did well.',
  'Genuinely did not see the turn coming, and on a reread it was signposted three chapters earlier.',
  'This is the third book of theirs I have read and the first one I would hand to someone else.',
  'Small thing, but the chapter titles are doing half the atmospheric work.',
  'Read it out of order by accident and it still held together, which says something.',
  'The middle section drags a little for me, but the ending earns it back.',
  'Every character here wants something specific, which sounds basic until you read the alternative.',
  'Bookmarked the whole thing. Will be very annoyed if the next one takes another year.',
  'I have opinions about the last four chapters and none of them are calm.',
  'Came for the premise, stayed for the minor characters. The steward deserves his own book.',
  'This one made me miss my stop on the way home. Take that as a review.',
  'Not sure the ending lands, but I respect that it commits to something.',
  'The prose is doing a lot with very short sentences and I am here for it.',
  'Recommended to me by someone with terrible taste, and now I owe them an apology.',
  'Reading this slowly on purpose. One chapter a night, like it was meant to be.',
  'There is a line in chapter nine that I have thought about every day since.',
  'Hard to explain why this works. It should not, on paper, and it absolutely does.',
  'I would read four hundred more pages of these people arguing about logistics.',
  'The restraint is the best thing about it. Nothing is oversold.',
  'Took me three attempts to get past the opening and I am glad I did.',
  'Anyone else read this as being about the house rather than the people in it?',
  'Second read, first time noticing how much of the ending is in the first chapter.',
  'Solid, but I liked the earlier series better. This one feels more careful and less alive.',
];

const REPLY_COMMENTS: readonly string[] = [
  'Agreed, though I would argue the middle is doing setup you only notice later.',
  'Same reaction here. Glad it was not just me.',
  'Completely disagree, and I think the reread makes my case for me.',
  'That line is the one everyone quotes and it deserves it.',
  'Which chapter do you mean? I think we are talking about two different scenes.',
  'This is the reply I came here to write, so I will just agree loudly instead.',
  'Fair, but the pacing complaint applies to the whole genre rather than this book.',
  'You have convinced me to go back and look at it again.',
  'I read it the same way, and then the author said something that made me reconsider.',
  'Not sure about that. The setup is doing more than it looks like on a first pass.',
  'Yes, and it pays off properly, which is rarer than it should be.',
  'Strong take. Wrong, but strong.',
  'Give it to chapter six before deciding. That is where it changes gear.',
  'I had the exact opposite reaction, which is probably the point.',
  'This thread has talked me into a reread.',
  'The minor characters carry it, I think we agree on that much.',
  'Depends what you wanted from it, honestly.',
  'Thanks for putting it this way. I could not work out what bothered me and this is it.',
];

/* -------------------------------------------------------------------------- */
/* Personas                                                                   */
/* -------------------------------------------------------------------------- */

interface AccountSpec {
  login: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

interface AuthorSpec extends AccountSpec {
  genre: Genre;
}

// Functional logins with real names: the login is what a person types to sign
// in, and the name is what the UI shows next to a book or a comment. A thread
// where "User Two" answers "User Four" reads as a test run, not a demo.
const STAFF: readonly AccountSpec[] = [
  {
    login: 'superadmin',
    firstName: 'Olga',
    lastName: 'Ivanova',
    role: 'superadmin',
  },
  { login: 'admin', firstName: 'Daniel', lastName: 'Reeves', role: 'admin' },
];

const AUTHORS: readonly AuthorSpec[] = [
  {
    login: 'mhale',
    firstName: 'Margaret',
    lastName: 'Hale',
    role: 'author',
    genre: GOTHIC,
  },
  {
    login: 'ipetrov',
    firstName: 'Ivan',
    lastName: 'Petrov',
    role: 'author',
    genre: HARD_SF,
  },
  {
    login: 'nquinn',
    firstName: 'Nora',
    lastName: 'Quinn',
    role: 'author',
    genre: URBAN_FANTASY,
  },
];

// Léa carries a non-ASCII name on purpose: the tables are utf8mb4, and a demo
// is the cheapest place to notice if something in the stack is not.
const READERS: readonly AccountSpec[] = [
  { login: 'user1', firstName: 'Sofia', lastName: 'Marchetti', role: 'user' },
  { login: 'user2', firstName: 'Emeka', lastName: 'Okonkwo', role: 'user' },
  { login: 'user3', firstName: 'Hannah', lastName: 'Whitfield', role: 'user' },
  { login: 'user4', firstName: 'Léa', lastName: 'Fontaine', role: 'user' },
  { login: 'user5', firstName: 'Grigory', lastName: 'Volkov', role: 'user' },
];

/* -------------------------------------------------------------------------- */
/* Plan: the whole demo as plain objects, before anything is written          */
/* -------------------------------------------------------------------------- */

interface PlannedChapter {
  title: string;
  text: string;
  createdAt: Date;
}

interface PlannedBook {
  title: string;
  description: string;
  tags: string[];
  // Every Co-author in credit order, the author it was planned under first.
  coAuthorLogins: string[];
  // An index into the author's own series list, or null for a standalone book.
  seriesIndex: number | null;
  status: BookStatus;
  createdAt: Date;
  chapters: PlannedChapter[];
}

interface PlannedSeries {
  title: string;
  description: string;
  tags: string[];
  // Every Co-author in credit order, the author it was planned under first.
  coAuthorLogins: string[];
  createdAt: Date;
}

// Accounts are referenced by their position in Plan.accounts, not by id: no row
// exists while the plan is being built.
interface PlannedComment {
  book: PlannedBook;
  accountIndex: number;
  text: string;
  createdAt: Date;
  depth: number;
  parent: PlannedComment | null;
}

interface PlannedLike {
  book: PlannedBook | null;
  comment: PlannedComment | null;
  accountIndex: number;
  isLike: boolean;
  createdAt: Date;
}

interface PlannedAuthor {
  spec: AuthorSpec;
  createdAt: Date;
  series: PlannedSeries[];
  books: PlannedBook[];
}

interface Plan {
  accounts: { spec: AccountSpec; createdAt: Date }[];
  authors: PlannedAuthor[];
  comments: PlannedComment[];
  // Kept beside the comments rather than on them, so a PlannedComment stays a
  // plain description of what was written and nothing has to be mutated after
  // the tree is built.
  tombstones: Map<PlannedComment, Tombstone>;
  likes: PlannedLike[];
}

// Lays an author's whole history out over PUBLICATION_WINDOW_DAYS, ending a few
// days ago so the newest chapter is genuinely new.
//
// The gaps are generated as relative weights and then scaled to fit the window,
// rather than drawn in days directly. That is the only way to honour both the
// window and "books are published one after another": ~190 chapters even at
// three days apart would span more than three years.
function layOutTimeline(rng: Rng, chapterCounts: readonly number[]): Date[][] {
  const weights: number[] = [];

  chapterCounts.forEach((count, bookIndex) => {
    if (bookIndex > 0) {
      // Four chapter-gaps' worth of silence between finishing one book and
      // starting the next.
      weights.push(4 * rng.float(0.6, 1.4));
    }
    for (let i = 1; i < count; i += 1) {
      weights.push(rng.float(0.6, 1.4));
    }
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const spanDays = PUBLICATION_WINDOW_DAYS - rng.int(0, 40);
  // Guards the degenerate single-chapter case, which the brief cannot produce
  // but which would otherwise divide by zero.
  const msPerWeight = totalWeight === 0 ? 0 : (spanDays * DAY_MS) / totalWeight;

  let cursor = Date.now() - rng.int(2, 5) * DAY_MS - spanDays * DAY_MS;
  let step = 0;

  return chapterCounts.map((count, bookIndex) => {
    if (bookIndex > 0) {
      cursor += weights[step] * msPerWeight;
      step += 1;
    }

    const dates = [new Date(cursor)];
    for (let i = 1; i < count; i += 1) {
      cursor += weights[step] * msPerWeight;
      step += 1;
      dates.push(new Date(cursor));
    }
    return dates;
  });
}

function planAuthor(rng: Rng, spec: AuthorSpec): PlannedAuthor {
  const { genre } = spec;
  const seriesCount = rng.int(1, 2);
  const standaloneCount = rng.int(1, 3);

  // Books of one series stay contiguous in time, and the blocks are then
  // shuffled: an author finishes a series, writes something standalone, starts
  // the next series. That is what keeps "newest chapters" on the front page
  // from being three books by the same person.
  const blocks: { seriesIndex: number | null; size: number }[] = [];
  for (let i = 0; i < seriesCount; i += 1) {
    blocks.push({ seriesIndex: i, size: rng.int(4, 5) });
  }
  for (let i = 0; i < standaloneCount; i += 1) {
    blocks.push({ seriesIndex: null, size: 1 });
  }

  const slots = rng
    .shuffle(blocks)
    .flatMap((block) =>
      Array.from({ length: block.size }, () => block.seriesIndex)
    );

  const chapterCounts = slots.map(() => rng.int(20, 24));
  const timeline = layOutTimeline(rng, chapterCounts);
  // One shuffled deck per author, so no author repeats a book title.
  const titles = rng.shuffle(genre.bookTitles);

  // The newest book is still a Draft; the one before it, and every book of the
  // series the draft belongs to, is In progress; everything older is Complete.
  // `slots` is in timeline order, so "newest" is simply the last one.
  const last = slots.length - 1;
  const ongoingSeries = slots[last];
  const statusOf = (index: number): BookStatus => {
    if (index === last) return 'draft';
    if (index === last - 1) return 'in_progress';
    if (ongoingSeries !== null && slots[index] === ongoingSeries) {
      return 'in_progress';
    }
    return 'complete';
  };

  const books: PlannedBook[] = slots.map((seriesIndex, index) => {
    const dates = timeline[index];
    const chapters = chapterTitles(rng, genre, dates.length).map(
      (title, chapterIndex) => ({
        title,
        text: chapterText(rng, genre),
        createdAt: dates[chapterIndex],
      })
    );

    return {
      title: titles[index],
      description: description(rng, genre, rng.int(3, 4)),
      tags: rng.sample(genre.tags, rng.int(3, 5)),
      coAuthorLogins: [spec.login],
      seriesIndex,
      status: statusOf(index),
      // The record exists a few days before chapter one does.
      createdAt: new Date(dates[0].getTime() - rng.int(1, 5) * DAY_MS),
      chapters,
    };
  });

  // Each series predates its own first book; the account predates all of it.
  const series: PlannedSeries[] = Array.from(
    { length: seriesCount },
    (_, index) => {
      const first =
        books.find((book) => book.seriesIndex === index) ?? books[0];
      return {
        title: genre.seriesTitles[index],
        description: description(rng, genre, rng.int(3, 4)),
        tags: rng.sample(genre.tags, rng.int(3, 5)),
        coAuthorLogins: [spec.login],
        createdAt: new Date(
          first.createdAt.getTime() - rng.int(2, 10) * DAY_MS
        ),
      };
    }
  );

  const earliest = Math.min(...books.map((book) => book.createdAt.getTime()));

  return {
    spec,
    createdAt: new Date(earliest - rng.int(60, 110) * DAY_MS),
    series,
    books,
  };
}

// The last author's first series gains the first author as a second
// Co-author. Its books stay credited to the last author alone: a series and
// the books in it keep independent Co-author lists.
function shareSeries(authors: readonly PlannedAuthor[]): PlannedAuthor[] {
  const last = authors.length - 1;
  const partner = authors[0].spec.login;

  return authors.map((author, index) =>
    index !== last
      ? author
      : {
          ...author,
          series: author.series.map((entry, seriesIndex) =>
            seriesIndex === 0
              ? { ...entry, coAuthorLogins: [...entry.coAuthorLogins, partner] }
              : entry
          ),
        }
  );
}

// Two standalone books gain a second Co-author: each author's last standalone
// book is shared with the next author in AUTHORS. Standalone, so neither book
// has to be filed under a series its new Co-author is not credited on.
function shareBooks(authors: readonly PlannedAuthor[]): PlannedAuthor[] {
  return authors.map((author, index) => {
    if (index >= SHARED_BOOK_COUNT) return author;

    const partner = authors[(index + 1) % authors.length].spec.login;
    const shared = author.books
      .filter((book) => book.seriesIndex === null)
      .at(-1);
    return {
      ...author,
      books: author.books.map((book) =>
        book === shared
          ? { ...book, coAuthorLogins: [...book.coAuthorLogins, partner] }
          : book
      ),
    };
  });
}

function planThreads(
  rng: Rng,
  books: readonly PlannedBook[],
  accounts: Plan['accounts']
): Pick<Plan, 'comments' | 'tombstones' | 'likes'> {
  const comments: PlannedComment[] = [];
  const likes: PlannedLike[] = [];
  const now = Date.now();
  const accountIndexes = accounts.map((_, i) => i);

  for (const book of books) {
    // Nobody comments on or likes a Draft book, so the seed writes neither.
    if (book.status === 'draft') continue;

    // Readers arrive once there is something to read; the third chapter is a
    // reasonable stand-in for "this book has started".
    const from =
      book.chapters[Math.min(2, book.chapters.length - 1)].createdAt.getTime();
    const to = now - 6 * 60 * 60 * 1000;

    // Sorted, so a reply is only ever chosen from comments that already exist —
    // which is what keeps a reply's timestamp after its parent's.
    const times = Array.from({ length: rng.int(3, 15) }, () =>
      rng.float(from, to)
    ).sort((a, b) => a - b);

    // One shuffled deck of each bank per book, consumed in order: two
    // identical comments under the same book read as a bug rather than as two
    // readers agreeing. Across books a repeat is fine, and expected.
    const topLevel = rng.shuffle(TOP_LEVEL_COMMENTS);
    const replies = rng.shuffle(REPLY_COMMENTS);
    let nextTopLevel = 0;
    let nextReply = 0;

    const inBook: PlannedComment[] = [];

    for (const time of times) {
      // Roughly one in three is a reply, and only to something shallow enough
      // to leave the thread three levels deep at most.
      const candidates = inBook.filter((candidate) => candidate.depth < 2);
      const parent =
        candidates.length > 0 && rng.chance(1 / 3)
          ? rng.pick(candidates)
          : null;

      const comment: PlannedComment = {
        book,
        // Any account, the book's own author included.
        accountIndex: rng.pick(accountIndexes),
        // The modulo only matters if a bank is ever made smaller than the
        // 15 comments a book can hold.
        text:
          parent === null
            ? topLevel[nextTopLevel++ % topLevel.length]
            : replies[nextReply++ % replies.length],
        createdAt: new Date(time),
        depth: parent === null ? 0 : parent.depth + 1,
        parent,
      };

      inBook.push(comment);
      comments.push(comment);
    }

    // 3-7 of the accounts not credited on the book like it, distinct by
    // construction so the unique index on (userId, bookId) is never tested by
    // a duplicate. No Co-author may like their own book, and the API would
    // refuse it, so the seed does not write one either.
    const likers = accountIndexes.filter(
      (index) => !book.coAuthorLogins.includes(accounts[index].spec.login)
    );
    for (const accountIndex of rng.sample(likers, rng.int(3, 7))) {
      likes.push({
        book,
        comment: null,
        accountIndex,
        isLike: !rng.chance(0.15),
        createdAt: new Date(rng.float(from, now)),
      });
    }
  }

  // Tombstones only on comments that have a reply: the whole point of a
  // tombstone is that the thread below it keeps its place. Half deleted by
  // their owner, half removed by a moderator — the second kind is the one
  // POST /api/comments/:id/restore can undo.
  const parents = comments.filter((comment) =>
    comments.some((other) => other.parent === comment)
  );
  const tombstones = new Map<PlannedComment, Tombstone>(
    rng
      .shuffle(parents)
      .slice(0, Math.min(parents.length, Math.round(comments.length / 20)))
      .map((comment, index) => [
        comment,
        index % 2 === 0 ? 'deleted' : 'removed',
      ])
  );

  // Likes on comments come after the tombstones, so a withheld comment does not
  // carry a like count for text nobody can read.
  for (const comment of comments) {
    if (tombstones.has(comment)) {
      continue;
    }
    for (const accountIndex of rng.sample(accountIndexes, rng.int(0, 4))) {
      likes.push({
        book: null,
        comment,
        accountIndex,
        isLike: !rng.chance(0.15),
        createdAt: new Date(rng.float(comment.createdAt.getTime(), now)),
      });
    }
  }

  return { comments, tombstones, likes };
}

function buildPlan(rng: Rng): Plan {
  const authors = shareSeries(
    shareBooks(AUTHORS.map((spec) => planAuthor(rng, spec)))
  );
  const earliest = Math.min(
    ...authors.map((author) => author.createdAt.getTime())
  );

  // Staff predate every author; readers arrive across the whole period, so the
  // users list is not ten accounts created the same afternoon.
  const accounts: Plan['accounts'] = [
    ...STAFF.map((spec) => ({
      spec,
      createdAt: new Date(earliest - rng.int(30, 90) * DAY_MS),
    })),
    ...authors.map((author) => ({
      spec: author.spec,
      createdAt: author.createdAt,
    })),
    ...READERS.map((spec) => ({
      spec,
      createdAt: new Date(rng.float(earliest, Date.now() - 30 * DAY_MS)),
    })),
  ];

  const threads = planThreads(
    rng,
    authors.flatMap((author) => author.books),
    accounts
  );

  return { accounts, authors, ...threads };
}

/* -------------------------------------------------------------------------- */
/* Write                                                                      */
/* -------------------------------------------------------------------------- */

// Ordered from the dependent end upwards, and deleted that way rather than left
// to the cascades. Deleting `users` alone would currently take everything with
// it, but that is a property of the schema's ON DELETE clauses, not of this
// script: the day one of them changes, a seed relying on it would start leaving
// rows behind silently. `permissions` is deliberately absent — it is reference
// data syncPermissions() derives from code, not demo content.
const CONTENT_MODELS: readonly ModelStatic<Model>[] = [
  Like,
  Comment,
  Chapter,
  BookAuthor,
  Book,
  SeriesAuthor,
  Series,
  User,
];

async function insertInBatches<T>(
  rows: readonly T[],
  insert: (batch: T[]) => Promise<unknown>
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    await insert(rows.slice(i, i + INSERT_BATCH));
  }
}

// Returns the ids in the same order as plan.accounts, which is how every
// accountIndex in the plan is resolved.
async function writeAccounts(
  plan: Plan,
  transaction: Transaction
): Promise<number[]> {
  const ids: number[] = [];

  for (const { spec, createdAt } of plan.accounts) {
    // createUserSchema carries no `role` on purpose: the role travels
    // separately so a PATCH body can never smuggle one in. The seed follows
    // that split rather than working around it.
    const fields = createUserSchema.parse({
      login: spec.login,
      email: `${spec.login}@example.com`,
      password: DEMO_PASSWORD,
      firstName: spec.firstName,
      lastName: spec.lastName,
      status: 'active',
    });

    // create(), not bulkCreate: bulkCreate defaults to individualHooks: false,
    // which would skip User.beforeSave and store the password in clear text.
    // `silent` is what stops save() from overwriting the backdated updatedAt.
    const user = await User.create(
      { ...fields, role: spec.role, createdAt, updatedAt: createdAt },
      { transaction, silent: true }
    );
    ids.push(user.id);
  }

  return ids;
}

async function writeContent(
  plan: Plan,
  accountIds: readonly number[],
  transaction: Transaction
): Promise<{
  bookIds: Map<PlannedBook, number>;
  chapters: number;
  series: number;
}> {
  const idByLogin = new Map(
    plan.accounts.map((account, index) => [
      account.spec.login,
      accountIds[index],
    ])
  );

  const idOf = (login: string): number => {
    const id = idByLogin.get(login);
    if (id === undefined) {
      throw new Error(`No account was created for ${login}`);
    }
    return id;
  };

  const bookIds = new Map<PlannedBook, number>();
  const creditRows: { bookId: number; userId: number; createdAt: Date }[] = [];
  const seriesCreditRows: {
    seriesId: number;
    userId: number;
    createdAt: Date;
  }[] = [];
  const chapterRows: {
    bookId: number;
    title: string;
    text: string;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];
  let seriesCount = 0;

  for (const author of plan.authors) {
    const seriesIds: number[] = [];
    for (const entry of author.series) {
      const fields = createSeriesSchema.parse(entry);
      const row = await Series.create(
        { ...fields, createdAt: entry.createdAt, updatedAt: entry.createdAt },
        { transaction, silent: true }
      );
      seriesIds.push(row.id);
      seriesCount += 1;
      for (const login of entry.coAuthorLogins) {
        seriesCreditRows.push({
          seriesId: row.id,
          userId: idOf(login),
          createdAt: entry.createdAt,
        });
      }
    }

    for (const book of author.books) {
      const fields = createBookSchema.parse({
        ...book,
        seriesId:
          book.seriesIndex === null ? null : seriesIds[book.seriesIndex],
      });
      const row = await Book.create(
        {
          ...fields,
          // Attached after the parse, like the Co-authors: createBookSchema
          // has no status, because every book the API creates is a draft.
          status: book.status,
          createdAt: book.createdAt,
          updatedAt: book.createdAt,
        },
        { transaction, silent: true }
      );
      bookIds.set(book, row.id);
      // In credit order: bulkCreate inserts the rows in one statement, in
      // input order, and the byline is ordered by the credits' ids.
      for (const login of book.coAuthorLogins) {
        creditRows.push({
          bookId: row.id,
          userId: idOf(login),
          createdAt: book.createdAt,
        });
      }

      for (const chapter of book.chapters) {
        const parsed = createChapterSchema.parse({
          bookId: row.id,
          title: chapter.title,
          text: chapter.text,
        });
        chapterRows.push({
          ...parsed,
          createdAt: chapter.createdAt,
          updatedAt: chapter.createdAt,
        });
      }
    }
  }

  await insertInBatches(seriesCreditRows, (batch) =>
    SeriesAuthor.bulkCreate(batch, { transaction })
  );
  await insertInBatches(creditRows, (batch) =>
    BookAuthor.bulkCreate(batch, { transaction })
  );
  await insertInBatches(chapterRows, (batch) =>
    Chapter.bulkCreate(batch, { transaction })
  );

  return { bookIds, chapters: chapterRows.length, series: seriesCount };
}

async function writeThreads(
  plan: Plan,
  accountIds: readonly number[],
  bookIds: Map<PlannedBook, number>,
  transaction: Transaction
): Promise<{ comments: number; likes: number }> {
  const bookIdOf = (book: PlannedBook): number => {
    const id = bookIds.get(book);
    if (id === undefined) {
      throw new Error(`No row was created for the book "${book.title}"`);
    }
    return id;
  };

  const commentIds = new Map<PlannedComment, number>();
  const maxDepth = plan.comments.reduce(
    (deepest, comment) => Math.max(deepest, comment.depth),
    0
  );

  // Level by level, because a reply needs its parent's id. bulkCreate on MySQL
  // back-fills the ids from the insert's first id plus the row count, in input
  // order; the check below is what would notice if that ever stopped holding.
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const level = plan.comments.filter((comment) => comment.depth === depth);
    if (level.length === 0) {
      continue;
    }

    const rows = level.map((comment) => {
      const parsed = createCommentSchema.parse({
        bookId: bookIdOf(comment.book),
        parentId:
          comment.parent === null ? null : commentIds.get(comment.parent),
        text: comment.text,
      });
      return {
        ...parsed,
        userId: accountIds[comment.accountIndex],
        tombstone: plan.tombstones.get(comment) ?? null,
        createdAt: comment.createdAt,
        updatedAt: comment.createdAt,
      };
    });

    // Not batched: the ids have to come back, and a batch boundary is one more
    // place for the ordering assumption above to go wrong.
    const created = await Comment.bulkCreate(rows, { transaction });
    created.forEach((row, index) => {
      if (typeof row.id !== 'number') {
        throw new Error(
          'bulkCreate returned no comment id; replies cannot be linked'
        );
      }
      commentIds.set(level[index], row.id);
    });
  }

  const likeRows = plan.likes.map((like) => {
    const parsed = createLikeSchema.parse({
      bookId: like.book === null ? null : bookIdOf(like.book),
      commentId: like.comment === null ? null : commentIds.get(like.comment),
      isLike: like.isLike,
    });
    return {
      ...parsed,
      userId: accountIds[like.accountIndex],
      createdAt: like.createdAt,
    };
  });

  await insertInBatches(likeRows, (batch) =>
    Like.bulkCreate(batch, { transaction })
  );

  return { comments: plan.comments.length, likes: likeRows.length };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

async function countExisting(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const model of CONTENT_MODELS) {
    counts[model.tableName] = await model.count();
  }

  return counts;
}

function assertSafeTarget(config: AppConfig, force: boolean): void {
  // Unconditional: no flag makes wiping a production database this script's
  // business.
  if (config.env === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV is production, and this script deletes rows.'
    );
  }

  if (force && config.db.database !== DEMO_DATABASE) {
    logger.warn(
      `--force given for a database other than ${DEMO_DATABASE}; every row in its content tables will be deleted`,
      { database: config.db.database }
    );
  }
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const config = loadConfig();
  assertSafeTarget(config, force);

  // The same two calls index.ts makes outside production, and idempotent, so a
  // fresh clone can seed before the server has ever run.
  await ensureDatabase(config.db);
  const sequelize = createSequelize(config.db);
  initModels(sequelize);
  await sequelize.authenticate();
  await sequelize.sync();

  try {
    if (!force) {
      logger.info(
        `Dry run: pass --force to delete these rows and reseed ${config.db.database}`,
        await countExisting()
      );
      return;
    }

    const plan = buildPlan(createRng(RNG_SEED));

    // One transaction over the delete and every insert: a half-seeded demo is
    // worse than no demo, and a failure here leaves the previous one intact.
    const totals = await sequelize.transaction(async (transaction) => {
      for (const model of CONTENT_MODELS) {
        await model.destroy({ where: {}, transaction });
      }

      const accountIds = await writeAccounts(plan, transaction);
      const content = await writeContent(plan, accountIds, transaction);
      const threads = await writeThreads(
        plan,
        accountIds,
        content.bookIds,
        transaction
      );

      return {
        accounts: accountIds.length,
        series: content.series,
        books: content.bookIds.size,
        chapters: content.chapters,
        ...threads,
      };
    });

    logger.info(`Seeded ${config.db.database}`, totals);
    logger.info(
      `Sign in as superadmin, admin, mhale, ipetrov, nquinn or user1-user5 — password ${DEMO_PASSWORD}`
    );
  } finally {
    await sequelize.close();
  }
}

await main().catch((error: unknown) => {
  logger.error(
    'Seeding failed; no rows were written',
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
