import type { UserRole } from '../../types/permission.ts';
import { GOTHIC, HARD_SF, URBAN_FANTASY, type ContentBank } from './content.ts';

export interface AccountSpec {
  login: string;
  firstName: string;
  lastName: string;
  role: UserRole;
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
  },
  { login: 'admin', firstName: 'Daniel', lastName: 'Reeves', role: 'admin' },
];

export const AUTHORS: readonly AuthorSpec[] = [
  {
    login: 'mhale',
    firstName: 'Margaret',
    lastName: 'Hale',
    role: 'author',
    bank: GOTHIC,
  },
  {
    login: 'ipetrov',
    firstName: 'Ivan',
    lastName: 'Petrov',
    role: 'author',
    bank: HARD_SF,
  },
  {
    login: 'nquinn',
    firstName: 'Nora',
    lastName: 'Quinn',
    role: 'author',
    bank: URBAN_FANTASY,
  },
];

// Léa carries a non-ASCII name on purpose: the tables are utf8mb4, and a demo
// is the cheapest place to notice if something in the stack is not.
export const READERS: readonly AccountSpec[] = [
  { login: 'user1', firstName: 'Sofia', lastName: 'Marchetti', role: 'user' },
  { login: 'user2', firstName: 'Emeka', lastName: 'Okonkwo', role: 'user' },
  { login: 'user3', firstName: 'Hannah', lastName: 'Whitfield', role: 'user' },
  { login: 'user4', firstName: 'Léa', lastName: 'Fontaine', role: 'user' },
  { login: 'user5', firstName: 'Grigory', lastName: 'Volkov', role: 'user' },
];
