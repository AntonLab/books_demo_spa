// Shared so the editor pages and the profile rows ask the same question
// before deleting a work.
export const DELETE_BOOK_CONFIRM = {
  title: 'Delete this book?',
  description: 'Its chapters and comments are deleted with it.',
  okText: 'Delete',
} as const;

export const DELETE_SERIES_CONFIRM = {
  title: 'Delete this series?',
  description: 'Its books stay, outside any series.',
  okText: 'Delete',
} as const;
