// mysql2 hands back an already-parsed value for a JSON column, but a dialect or
// driver that returned the raw string would otherwise be spread character by
// character downstream. A genuinely corrupt value still throws.
//
// Shared by every model with a JSON tag column (see Series.ts, Book.ts), the
// same way likePattern.ts is shared by the repositories.
export function toTagArray(value: unknown): string[] {
  const candidate =
    typeof value === 'string' ? (JSON.parse(value) as unknown) : value;

  return Array.isArray(candidate)
    ? candidate.filter((tag): tag is string => typeof tag === 'string')
    : [];
}
