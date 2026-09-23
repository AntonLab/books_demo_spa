// The seeded randomness the whole demo is drawn from. Kept apart from seed.ts
// so the plan and its spec can use it without importing a script that seeds on
// import.

// Fixed, so the shape of the demo is reproducible. Change it to get a
// different — but equally repeatable — database.
export const RNG_SEED = 1_357_911;

// mulberry32: a 32-bit PRNG that fits in five lines and needs no dependency.
// Math.random cannot be seeded, which is the whole requirement here.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// The plan indexes arrays it has just built, so a miss is a bug in the plan,
// not a state to tolerate. Under noUncheckedIndexedAccess every such read is
// `T | undefined`; this turns a miss into an error naming what was missing,
// instead of an undefined field that fails later, inside the transaction.
export function itemAt<T>(items: readonly T[], index: number, what: string): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Seed plan has no ${what} at index ${index}`);
  }
  return item;
}

export interface Rng {
  float(min: number, max: number): number;
  // Inclusive at both ends: the ranges in the brief are written that way
  // ("20-24 chapters" includes both).
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  // Distinct members, which is what the unique indexes on `likes` require of
  // the accounts liking one target.
  sample<T>(items: readonly T[], count: number): T[];
  shuffle<T>(items: readonly T[]): T[];
  chance(probability: number): boolean;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      const atI = itemAt(copy, i, 'item to shuffle');
      const atJ = itemAt(copy, j, 'item to shuffle');
      copy[i] = atJ;
      copy[j] = atI;
    }
    return copy;
  };

  return {
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) =>
      itemAt(items, Math.floor(next() * items.length), 'item to pick'),
    sample: (items, count) => shuffle(items).slice(0, count),
    shuffle,
    chance: (probability) => next() < probability,
  };
}
