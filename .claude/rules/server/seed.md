---
paths:
  - 'server/src/db/seed/**'
---

# Demo seed

`npm run seed -w server -- --force` from the repo root. Without `--force` it
reports row counts and exits.

## Accounts

All `active`, password `Password123!`, email `<login>@example.com`:

| Login           | Name                               | Role         |
| --------------- | ---------------------------------- | ------------ |
| `superadmin`    | Olga Ivanova                       | `superadmin` |
| `admin`         | Daniel Reeves                      | `admin`      |
| `mhale`         | Margaret Hale — Gothic             | `author`     |
| `ipetrov`       | Ivan Petrov — Hard SF              | `author`     |
| `nquinn`        | Nora Quinn — Urban Fantasy         | `author`     |
| `user1`…`user5` | Sofia, Emeka, Hannah, Léa, Grigory | `user`       |

Names are real ones because the UI shows the name: "User Two" answering "User
Four" reads as a test run, not a demo.

## Rules that keep the data honest

- **It writes through the models, not the API**, since registration cannot mint
  an admin. Payloads still pass the routes' zod schemas; only the fields those
  withhold (Co-authors, role, status) are attached afterwards. `genreId` goes
  through the schema with the rest.
- **Accounts use `create()`, everything else `bulkCreate()`.** `bulkCreate`
  skips `User.beforeSave` and would store the password in clear. Comments go
  one thread level at a time, because a reply needs its parent's id and MySQL
  back-fills bulk ids from the first; `writeThreads` throws on a missing id.
- **Dates anchor to the run**: the newest chapter is always 2-5 days old, the
  cadence scales to `PUBLICATION_WINDOW_DAYS`, `createdAt` is passed
  explicitly, and `{ silent: true }` keeps a backdated `updatedAt`.
- **Everything already out is announced** (`announcedAt` = the run's start) on
  books and chapters, or the first announcement pass would mail every Favorite
  holder about the catalogue. Scheduled chapters and Draft books stay
  unannounced, so the pass announces them when their time comes.
- The data never shows what the API would refuse: no like on one's own book or
  comment, none on a tombstone or Draft book, no Favorite on a Draft book or on
  a series with no non-draft book, no activity before an account's
  `createdAt`, no Notification that contradicts a byline.
- A content bank (`ContentBank`: `GOTHIC`, `HARD_SF`, `URBAN_FANTASY`) supplies
  each author's titles, tags and prose. The seed writes a two-level Genre tree
  (`GENRE_TREE`). A bank's `genreName` is typed `SubgenreName`, so it cannot
  name a Genre the seed never creates; even-numbered works (counted per author,
  no RNG draw) sit under that Subgenre, odd-numbered ones under its parent.
  Mystery and most Subgenres stay empty on purpose, to demo an empty Genre.
- Demo shape: two standalone books and one series are co-authored
  (`shareBooks`, `shareSeries`), and the tags `mystery` and `slow-burn` span
  two banks each, so `?tag=` returns more than one author. Each author's newest
  book is a Draft (last two chapters Draft), the one before it and its series
  In progress (next chapter Scheduled), older ones Complete (`statusOf`,
  `publicationOf`). Each author starts with two unread Notifications
  (`writeNotifications`). Each reader (`user1`…`user5`) holds 2-4 Favorite
  books and one Favorite series (`planFavorites`), drawn after every other
  draw so adding them changed nothing else. Each reader also owns 1-2 Reading
  lists of 3-6 shown works (`planReadingLists`), drawn after the Library.

## Deleting

- Tables are deleted in the explicit order of `CONTENT_MODELS` in `seed.ts`
  (children before parents), not by leaning on cascades that could change; a
  new table joins that list.
  Covers and Avatars go by cascade with `books`/`users`. `permissions` is left
  alone: `syncPermissions()` derives it from code.
- The delete and every insert share one transaction; a failure leaves the
  previous demo intact.
- Guards (`seedGuards.ts`): `NODE_ENV=production` is refused regardless of
  flags; a `DB_NAME` other than `books_demo_spa` gets a loud warning.

## Tests

`plan.spec.ts` unit-tests the plan with no database; nothing under `seed/`
except `seed.ts` runs on import. `seed.spec.ts` runs the script as a child
process three times: a production run (refused before connecting), a dry run
(no row count changes, `genres` among the reported tables) and a `--force` run
checked for rows the API would refuse.
