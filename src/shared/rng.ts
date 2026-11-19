// Seeded, deterministic PRNG (mulberry32). All procedural generation and enemy
// patterns draw from this so that a fixed seed reproduces a fixed run on both the
// client and the server. Do NOT use Math.random() anywhere in the simulation core.

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Current internal state, so a run can be snapshotted/restored deterministically. */
  state(): number;
}

/** Create a mulberry32 PRNG from a 32-bit unsigned seed. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;

  function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    state(): number {
      return s >>> 0;
    },
  };
}
