// The request/response schemas (createCommentSchema and friends) land with the
// CRUD API; only the serialised shape the model produces lives here so far.
//
// One constraint to carry over when they are written: `text` is a TEXT column,
// which holds 65,535 *bytes* — as few as ~16k characters under utf8mb4 — so the
// create schema owes it a `.max()` well inside that, or MySQL truncates (or, in
// strict mode, rejects) the write. Chapters take the same care at a far larger
// bound; see CHAPTER_TEXT_MAX_LENGTH in types/chapter.ts.

// The full record. `parentId` is null for a top-level comment.
export interface PublicComment {
  id: number;
  parentId: number | null;
  userId: number;
  bookId: number;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}
