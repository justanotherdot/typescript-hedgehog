/**
 * Proper 64-bit SplitMix64 implementation using BigInt.
 *
 * This provides high-quality splittable random number generation
 * with full 64-bit precision, matching the reference implementations.
 */
export class Seed {
  constructor(
    public readonly state: bigint,
    public readonly gamma: bigint
  ) {}

  /**
   * Create a new seed from a single value.
   */
  static fromNumber(value: number): Seed {
    const bigValue = BigInt(Math.floor(value));
    const state = splitmix64Mix(bigValue);
    const gamma = mixGamma(state);
    return new Seed(state, gamma);
  }

  /**
   * Create a random seed using current time.
   */
  static random(): Seed {
    const now =
      BigInt(Date.now()) * BigInt(Math.floor(Math.random() * 0x100000000));
    return Seed.fromNumber(Number(now & 0xffffffffn));
  }

  /**
   * Split a seed into two independent seeds.
   * Uses SplitMix64 splitting strategy for independence.
   */
  split(): [Seed, Seed] {
    const newState = addU64(this.state, this.gamma);
    const output = splitmix64Mix(newState);
    const newGamma = mixGamma(output);

    return [new Seed(newState, this.gamma), new Seed(output, newGamma)];
  }

  /**
   * Generate the next random value and advance the seed.
   * Uses SplitMix64 algorithm for high-quality randomness.
   */
  nextUint32(): [number, Seed] {
    const newState = addU64(this.state, this.gamma);
    const output = splitmix64Mix(newState);
    // Take upper 32 bits for better quality
    const value = Number((output >> 32n) & 0xffffffffn);
    return [value, new Seed(newState, this.gamma)];
  }

  /**
   * Generate a bounded random value [0, bound).
   */
  nextBounded(bound: number): [number, Seed] {
    const [value, newSeed] = this.nextUint32();
    return [Math.floor((value / 0x100000000) * bound), newSeed];
  }

  /**
   * Generate a random boolean.
   */
  nextBool(): [boolean, Seed] {
    const newState = addU64(this.state, this.gamma);
    const output = splitmix64Mix(newState);
    return [(output & 1n) === 1n, new Seed(newState, this.gamma)];
  }

  /**
   * Generate a random float in [0, 1).
   */
  nextFloat(): [number, Seed] {
    const [value, newSeed] = this.nextUint32();
    return [value / 0x100000000, newSeed];
  }

  toString(): string {
    return `Seed(${this.state}, ${this.gamma})`;
  }
}

// 64-bit unsigned integer arithmetic with proper wrapping
const MAX_U64 = 1n << 64n; // 2^64

function wrapU64(n: bigint): bigint {
  if (n >= MAX_U64) {
    return n % MAX_U64; // Wrap on overflow
  } else if (n < 0n) {
    return MAX_U64 + (n % MAX_U64); // Handle negative wrapping
  }
  return n;
}

function addU64(a: bigint, b: bigint): bigint {
  return wrapU64(a + b);
}

function mulU64(a: bigint, b: bigint): bigint {
  return wrapU64(a * b);
}

/**
 * SplitMix64 mixing function with proper 64-bit wrapping arithmetic.
 * Uses the exact constants and operations from the reference implementation.
 */
function splitmix64Mix(z: bigint): bigint {
  z = addU64(z, 0x9e3779b97f4a7c15n);
  z = mulU64(z ^ (z >> 30n), 0xbf58476d1ce4e5b9n);
  z = mulU64(z ^ (z >> 27n), 0x94d049bb133111ebn);
  return z ^ (z >> 31n);
}

/**
 * Generate a good gamma value for SplitMix64 splitting.
 * Ensures gamma is odd for maximal period.
 */
function mixGamma(z: bigint): bigint {
  z = splitmix64Mix(z);
  // Ensure gamma is odd for maximal period
  return mulU64(z | 1n, 0x9e3779b97f4a7c15n);
}
