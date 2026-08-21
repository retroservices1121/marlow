/**
 * Deterministic seeded RNG.
 *
 * Every piece of derived building geometry in Marlow comes from here. The same
 * address string must produce the same numbers forever, on every device, in
 * every browser, with no storage involved.
 *
 * Derivation is namespaced with `subRandom(address, key)` rather than pulled
 * from one long sequential stream. That way adding a new derived property later
 * (a chimney, a fifth roof type) does not shift every property that came after
 * it in the draw order, and the whole town does not rearrange itself.
 */

/** xmur3 — string to a well-mixed 32-bit seed. */
export function hashString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 — tiny, fast, good enough distribution for geometry. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = {
  /** Next float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Element of `items`. */
  pick<T>(items: readonly T[]): T;
  /** True with the given probability. */
  chance(probability: number): boolean;
};

export function seededRandom(address: string): Rng {
  const next = mulberry32(hashString(address));
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    chance: (probability) => next() < probability,
  };
}

/**
 * An independent stream for one named property of one address.
 * `subRandom('108 Main Street', 'roof')` never interferes with `'width'`.
 */
export function subRandom(address: string, key: string): Rng {
  return seededRandom(`${address}#${key}`);
}

/** Standalone helpers, for callers holding an rng. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return rng.pick(items);
}

export function range(rng: Rng, min: number, max: number): number {
  return rng.range(min, max);
}
