// A Genre as every response carries it: the row itself, its parent when it is a
// Subgenre (null for a top-level Genre), and what a Book or a Series embeds as
// `genre` or leaves null. No timestamps — nothing shows when a Genre was added,
// so there is no Date here for Wire<T> to turn into a string.
export interface PublicGenre {
  id: number;
  name: string;
  parent: { id: number; name: string } | null;
}

// An entry of the Genre list: the flat row with its parent's id.
export interface GenreListItem {
  id: number;
  name: string;
  parentId: number | null;
}

// What the admin list adds: how many Books and Series point at the Genre.
export interface AdminGenreListItem extends GenreListItem {
  bookCount: number;
  seriesCount: number;
}

// The longest name the API accepts, counted after trimming. The column is
// VARCHAR(50), and the client validates against this rather than waiting for
// the server's 400.
export const GENRE_NAME_MAX_LENGTH = 50;

// The body of POST /api/genres.
export interface GenrePayload {
  name: string;
  parentId?: number | null;
}

// The body of PATCH /api/genres/:id: any subset of the create body.
export type GenreUpdatePayload = Partial<GenrePayload>;
