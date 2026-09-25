// A Genre as every response carries it: the row itself, and what a Book
// or a Series embeds as `genre` or leaves null. No timestamps — nothing shows
// when a Genre was added, so there is no Date here for Wire<T> to turn into a
// string.
export interface PublicGenre {
  id: number;
  name: string;
}

// The longest name the API accepts, counted after trimming. The column is
// VARCHAR(50), and the client validates against this rather than waiting for
// the server's 400.
export const GENRE_NAME_MAX_LENGTH = 50;
