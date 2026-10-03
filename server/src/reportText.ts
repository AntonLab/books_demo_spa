import { REOPEN_DISTANCE_RATIO } from 'shared';

export function normaliseCommentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

export function shouldReopen(dismissedText: string, newText: string): boolean {
  const a = normaliseCommentText(dismissedText);
  const b = normaliseCommentText(newText);
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return false;
  const limit = REOPEN_DISTANCE_RATIO * longest;
  // The length gap alone is a lower bound on the distance; skipping the
  // quadratic table here keeps a 10,000-character comment cheap.
  if (Math.abs(a.length - b.length) > limit) return true;
  return levenshtein(a, b) > limit;
}
