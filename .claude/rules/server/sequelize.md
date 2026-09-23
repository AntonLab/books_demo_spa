---
paths:
  - 'server/src/models/**'
  - 'server/src/repositories/**'
  - 'server/src/db/**'
---

# Sequelize and MySQL

## Models

- Attributes come from `InferAttributes` / `InferCreationAttributes`,
  server-generated columns are `CreationOptional`, and every field is
  `declare`d, or it emits a class property that shadows Sequelize's accessor.
- The dialect is MySQL: `DataTypes.JSONB` and `DataTypes.ARRAY` do not exist
  here.
- Tables are `utf8mb4` / `utf8mb4_0900_ai_ci`; MySQL's `utf8` is 3-byte and
  drops emoji. Past `VARCHAR(255)`, index with a prefix.
- **`login` is `utf8mb4_0900_as_cs`**, given as a raw type string because
  Sequelize 6 has no per-column collation, so `Bob` and `bob` are two users.
  `email` inherits the case-insensitive default. A query matching `login`
  alongside such fields needs an explicit `COLLATE` (`buildWhere` in
  `userRepository.ts`).
- Uniqueness is a unique index, never a validator running `findOne` first.
- A hook passes `options.transaction` to every query it runs. External side
  effects stay out of hooks: `afterCreate` fires before commit, and a rollback
  cannot unsend an email.
- A failed `sequelize.authenticate()` stops the process.

## Columns

- `tags` are `JSON` columns: a JSON column takes no literal `DEFAULT`, so the
  `[]` default lives in the create schemas. Membership is `JSON_CONTAINS`, never
  `LIKE` (`?tag=epic` would match `epic-fantasy`), with the tag passed as an
  argument to `fn()`.
- `chapters.text` is `MEDIUMTEXT`: `TEXT` is 65,535 bytes, ~16k characters in
  utf8mb4. `CHAPTER_TEXT_MAX_LENGTH` (1,000,000) fits even at 4 bytes each.
- `chapterRepository.list` omits `text` and returns `ChapterSummary`; the
  omission sits in the type so no call site puts it back.
- Credits are ordered by surrogate `id`, not `createdAt`: whole-second
  `DATETIME` ties two credits added in one second.
- `book_covers` / `user_avatars` keep `updatedAt` and drop `createdAt` (replaced
  in place); `book_authors` / `series_authors` do the reverse (never edited).

## Foreign keys

- Types match exactly: every id is `INTEGER UNSIGNED`, and a plain `INTEGER`
  referencing one fails with errno 3780.
- Credits live in two tables, not one polymorphic `credits`, so each keeps a
  real foreign key. Both `CASCADE`; whether a work goes with its last credit is
  `userRepository.remove`'s decision.
- `books.seriesId` is nullable, `SET NULL`: dropping a series unlinks its
  books. The association passes `allowNull: true` in `foreignKey`, since MySQL
  rejects `SET NULL` on a `NOT NULL` column.
- `chapters.bookId` is the mirror: `NOT NULL`, `CASCADE`. Check which shape an
  optional link deserves before copying either.
- `comments.parentId` is `SET NULL`, not `CASCADE` (ADR-0002): MySQL fails a
  cascade past 15 levels (`ER_FK_DEPTH_EXCEEDED`, errno 3008), which would take
  a book's delete down with it. `commentRepository.spec.ts` covers a 20-deep
  thread. The replies association declares `onUpdate: 'RESTRICT'`, because a
  self-referential `ON UPDATE CASCADE` silently behaves as `RESTRICT` anyway.
- `comments.userId` is `SET NULL`, the one owner reference that is not
  `CASCADE`: `userRepository.remove` tombstones the account's comments first,
  so an owner-less comment is never live.
- `likes` points at exactly one of `bookId` / `commentId`. Sequelize 6 cannot
  declare the `CHECK`, so the XOR is enforced by a `.refine()` on
  `createLikeSchema` and a model `validate`; raw SQL can still break it. Add the
  `CHECK` when migrations arrive. Both targets `CASCADE`, since `SET NULL`
  would produce the state the XOR forbids.
- `likes` has unique indexes on `(userId, bookId)` and `(userId, commentId)`.
  NULLs are distinct in a unique index, so the two do not interfere. They also
  serve `?userId=`; a further index would cost every insert on the busiest
  table.
- `bookRepository` maps a `ForeignKeyConstraintError` on create to
  `NotFoundError('User')`: the first credit is the only reference that can
  fail, because a series is checked under lock by `nextSeriesPosition` first.

## Changing a table's shape

`sequelize.sync()` runs without `alter`: it creates a missing table and never
touches an existing one. A new column, index or `ENUM` value reaches a
developer's database only by dropping it (`DROP DATABASE books_demo_spa`); the
next boot rebuilds it. A new table needs no drop. Say which one a change needs
in its PR.

`sequelize-cli` is not installed. When it is, remember the package is ESM:
name migrations `.cjs` or write them as ESM.
