// No `title` field: the books table has no title column. See the plan header.
export interface PublicBook {
  id: number;
  userId: number;
  seriesId: number | null;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
