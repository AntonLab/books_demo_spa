// The Genre shape and the server's own name ceiling, from the shared workspace
// (ADR-0006). Neither carries a date, so PublicGenre needs no Wire<> — unlike
// PublicBook, which does.
export { GENRE_NAME_MAX_LENGTH, type PublicGenre } from 'shared';
