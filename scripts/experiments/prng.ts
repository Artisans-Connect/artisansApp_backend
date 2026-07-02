/**
 * Deterministic, seedable PRNG (mulberry32) + sampling helpers.
 *
 * All experiments seed from a fixed value so every reported figure is
 * bit-for-bit reproducible: `npm run bench` twice yields identical output.
 */

export type Rng = () => number;

/** mulberry32 — small, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform in [min, max). */
export function uniform(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

/** Integer in [min, max]. */
export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(uniform(rng, min, max + 1));
}

/** Box–Muller standard normal, then scaled; clamped to [lo, hi]. */
export function normal(rng: Rng, mean: number, sd: number, lo = -Infinity, hi = Infinity): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(lo, Math.min(hi, mean + z * sd));
}

/** Bernoulli trial with probability p. */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** In-place Fisher–Yates shuffle using the supplied rng. */
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
