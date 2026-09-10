// Dates cross the wire as ISO strings; the server types them as Date in
// process. See client/CLAUDE.md.
export interface PublicChapter {
  id: number;
  bookId: number;
  title: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

// What the list endpoint returns: the same record minus the body, so a page of
// chapters cannot drag a MEDIUMTEXT column per row across the wire.
export type ChapterSummary = Omit<PublicChapter, 'text'>;
