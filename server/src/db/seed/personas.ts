import type { UserRole } from 'shared';
import { GOTHIC, HARD_SF, URBAN_FANTASY, type ContentBank } from './content.ts';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface AccountSpec {
  login: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  // Empty means no About.
  about: string;
  // Relative to the run, like the chapter dates, so the demo never looks
  // abandoned; null means never seen. "Today" and "yesterday" are calendar days
  // on the viewer's clock, so a run in the first 20 minutes after midnight
  // shows admin as yesterday, and one in the first hour shows mhale two days
  // back. Accepted for demo data.
  lastSeenAgoMs: number | null;
  showLastSeen: boolean;
}

export interface AuthorSpec extends AccountSpec {
  bank: ContentBank;
}

// Functional logins with real names: the login is what a person types to sign
// in, and the name is what the UI shows next to a book or a comment. A thread
// where "User Two" answers "User Four" reads as a test run, not a demo.
export const STAFF: readonly AccountSpec[] = [
  {
    login: 'superadmin',
    firstName: 'Olga',
    lastName: 'Ivanova',
    role: 'superadmin',
    about: '',
    lastSeenAgoMs: 2 * MINUTE_MS,
    showLastSeen: true,
  },
  {
    login: 'admin',
    firstName: 'Daniel',
    lastName: 'Reeves',
    role: 'admin',
    about: '',
    lastSeenAgoMs: 20 * MINUTE_MS,
    showLastSeen: true,
  },
];

export const AUTHORS: readonly AuthorSpec[] = [
  {
    login: 'mhale',
    firstName: 'Margaret',
    lastName: 'Hale',
    role: 'author',
    about:
      'Former archivist, now writing ghost stories full time.\nMost of them start in a house I once had to catalogue.',
    lastSeenAgoMs: 25 * HOUR_MS,
    showLastSeen: true,
    bank: GOTHIC,
  },
  {
    login: 'ipetrov',
    firstName: 'Ivan',
    lastName: 'Petrov',
    role: 'author',
    about:
      'I spent fifteen years as a flight dynamics engineer before I swapped orbital mechanics for novels. I still check the delta-v budget of every story, and I would rather cut a good scene than let the physics lie.',
    lastSeenAgoMs: 9 * DAY_MS,
    showLastSeen: true,
    bank: HARD_SF,
  },
  {
    login: 'nquinn',
    firstName: 'Nora',
    lastName: 'Quinn',
    role: 'author',
    about:
      'I grew up above a night bakery in Dublin, and every city I have lived in since has felt a little haunted by comparison. I write urban fantasy about the people who keep a city running after dark: couriers, bakers, bus drivers, the woman who sells umbrellas outside the station and knows more than she lets on.\nBefore novels I wrote radio plays and a long-running column about local folklore. Both taught me the same lesson: a reader forgives almost anything except a character who does not sound like a person. These days I write in the early morning, with the first batch of bread still in my memory.',
    lastSeenAgoMs: 40 * DAY_MS,
    showLastSeen: true,
    bank: URBAN_FANTASY,
  },
];

// Léa carries a non-ASCII name on purpose: the tables are utf8mb4, and a demo
// is the cheapest place to notice if something in the stack is not.
export const READERS: readonly AccountSpec[] = [
  {
    login: 'user1',
    firstName: 'Sofia',
    lastName: 'Marchetti',
    role: 'user',
    about: '',
    lastSeenAgoMs: null,
    showLastSeen: true,
  },
  {
    login: 'user2',
    firstName: 'Emeka',
    lastName: 'Okonkwo',
    role: 'user',
    about: '',
    lastSeenAgoMs: 3 * DAY_MS,
    showLastSeen: true,
  },
  {
    login: 'user3',
    firstName: 'Hannah',
    lastName: 'Whitfield',
    role: 'user',
    about: '',
    lastSeenAgoMs: 14 * DAY_MS,
    showLastSeen: false,
  },
  {
    login: 'user4',
    firstName: 'Léa',
    lastName: 'Fontaine',
    role: 'user',
    about: '',
    lastSeenAgoMs: 90 * MINUTE_MS,
    showLastSeen: true,
  },
  {
    login: 'user5',
    firstName: 'Grigory',
    lastName: 'Volkov',
    role: 'user',
    about: '',
    lastSeenAgoMs: 120 * DAY_MS,
    showLastSeen: true,
  },
];
