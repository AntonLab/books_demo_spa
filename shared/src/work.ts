// The field limits a Book and a Series share, counted after trimming. The
// server's schemas enforce them; the client's form stops typing at them, so
// an over-long value never comes back as a 400. The tag limits stay in the
// server: the tag Select checks neither.
export const WORK_TITLE_MAX_LENGTH = 255;
export const WORK_DESCRIPTION_MAX_LENGTH = 5000;
