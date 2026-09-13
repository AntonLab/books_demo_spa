// Type-level assertions for Wire<T>. Nothing runs this file: `npm run
// typecheck` compiles it, and a Wire change that breaks one of the shapes
// below fails there as `Type 'false' does not satisfy the constraint 'true'`.
import type { PublicChapter } from './chapter.ts';
import type { NotificationList } from './notification.ts';
import type { Wire } from './wire.ts';

// Strict equality: mutual assignability would call `{ a?: string }` and
// `{ a: string | undefined }` the same, and optionality is one of the things
// Wire must keep.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

type Stamped = { kind: 'stamped'; at: Date };
type Unstamped = { kind: 'unstamped'; note: string };

// Exported only so that noUnusedLocals leaves the tuple alone.
export type WireAssertions = [
  // A Date becomes a string; everything else is left as it is.
  Expect<Equal<Wire<Date>, string>>,
  Expect<Equal<Wire<string>, string>>,
  Expect<Equal<Wire<number>, number>>,
  Expect<Equal<Wire<boolean>, boolean>>,
  Expect<Equal<Wire<'draft' | 'complete'>, 'draft' | 'complete'>>,

  // null and undefined survive, inside a union or on their own.
  Expect<Equal<Wire<null>, null>>,
  Expect<Equal<Wire<Date | null>, string | null>>,
  Expect<Equal<Wire<Date | undefined>, string | undefined>>,

  // Optional and readonly properties keep their modifiers.
  Expect<Equal<Wire<{ at?: Date }>, { at?: string }>>,
  Expect<Equal<Wire<{ readonly at: Date }>, { readonly at: string }>>,

  // Arrays stay arrays, readonly ones readonly, and their elements convert.
  Expect<Equal<Wire<Date[]>, string[]>>,
  Expect<Equal<Wire<readonly Date[]>, readonly string[]>>,
  Expect<Equal<Wire<{ at: Date }[]>, { at: string }[]>>,

  // Nesting is followed all the way down.
  Expect<
    Equal<
      Wire<{ outer: { inner: { at: Date | null }[] } }>,
      { outer: { inner: { at: string | null }[] } }
    >
  >,

  // A union of object shapes converts member by member, so a discriminant
  // still narrows.
  Expect<
    Equal<
      Wire<Stamped | Unstamped>,
      { kind: 'stamped'; at: string } | { kind: 'unstamped'; note: string }
    >
  >,

  // Two real shapes: an interface with a nullable date, and one that extends
  // a generic list envelope.
  Expect<
    Equal<
      Wire<PublicChapter>,
      {
        id: number;
        bookId: number;
        title: string;
        text: string;
        publishedAt: string | null;
        createdAt: string;
        updatedAt: string;
      }
    >
  >,
  Expect<Equal<Wire<NotificationList>['items'][number]['createdAt'], string>>,
];
