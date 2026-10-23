// True when exactly one of a, b is non-null/undefined; 0 and '' count as set.
export function exactlyOneSet(a: unknown, b: unknown): boolean {
  return (a == null) !== (b == null);
}
