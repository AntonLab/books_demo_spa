// Backs the exactly-one-target checks of Favorite, Like and ReadingListItem.
export function exactlyOneSet(a: unknown, b: unknown): boolean {
  return (a == null) !== (b == null);
}
