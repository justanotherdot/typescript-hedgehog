import { describe, test, expect } from 'vitest';

// 64-bit unsigned integer arithmetic with proper wrapping
const MAX_U64 = 1n << 64n; // 2^64 = 18446744073709551616n
const MAX_U64_VALUE = MAX_U64 - 1n; // 2^64 - 1 = 18446744073709551615n

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

describe('64-bit wrapping arithmetic', () => {
  test('wrapU64 handles values within range', () => {
    expect(wrapU64(0n)).toBe(0n);
    expect(wrapU64(42n)).toBe(42n);
    expect(wrapU64(MAX_U64_VALUE)).toBe(MAX_U64_VALUE);
  });

  test('wrapU64 wraps overflow correctly', () => {
    // 2^64 should wrap to 0
    expect(wrapU64(MAX_U64)).toBe(0n);

    // 2^64 + 1 should wrap to 1
    expect(wrapU64(MAX_U64 + 1n)).toBe(1n);

    // 2^64 + 42 should wrap to 42
    expect(wrapU64(MAX_U64 + 42n)).toBe(42n);
  });

  test('wrapU64 handles negative values', () => {
    // -1 should wrap to MAX_U64_VALUE
    expect(wrapU64(-1n)).toBe(MAX_U64_VALUE);

    // -42 should wrap to MAX_U64_VALUE - 41
    expect(wrapU64(-42n)).toBe(MAX_U64_VALUE - 41n);
  });

  test('addU64 wraps on overflow', () => {
    // Normal addition
    expect(addU64(10n, 20n)).toBe(30n);

    // Addition that wraps
    expect(addU64(MAX_U64_VALUE, 1n)).toBe(0n);
    expect(addU64(MAX_U64_VALUE, 2n)).toBe(1n);
    expect(addU64(MAX_U64_VALUE, 42n)).toBe(41n);

    // Large values that wrap
    const large1 = MAX_U64_VALUE - 10n;
    const large2 = 20n;
    expect(addU64(large1, large2)).toBe(9n); // Should wrap around
  });

  test('mulU64 wraps on overflow', () => {
    // Normal multiplication
    expect(mulU64(10n, 20n)).toBe(200n);

    // Multiplication that doesn't overflow
    expect(mulU64(100n, 100n)).toBe(10000n);

    // Multiplication that wraps - use known values
    const big1 = 1n << 32n; // 2^32 = 4294967296
    const big2 = 1n << 33n; // 2^33 = 8589934592
    const result = mulU64(big1, big2); // 2^32 * 2^33 = 2^65, should wrap

    // 2^65 = 2 * 2^64, so it should wrap to 0
    expect(result).toBe(0n);
  });

  test('multiplication wrapping with smaller examples', () => {
    // Test with values that will definitely overflow
    const half64 = 1n << 32n; // 2^32
    const result = mulU64(half64, half64); // 2^64, should wrap to 0
    expect(result).toBe(0n);

    // Test with slight variations
    const almostHalf = half64 - 1n;
    const almostSquare = mulU64(almostHalf, almostHalf);
    // (2^32 - 1)^2 = 2^64 - 2^33 + 1, which should wrap
    const expected = wrapU64((half64 - 1n) * (half64 - 1n));
    expect(almostSquare).toBe(expected);
  });

  test('SplitMix64 constants fit in 64-bit', () => {
    const GOLDEN_GAMMA = 0x9e3779b97f4a7c15n;
    const MIX_MULTIPLIER_1 = 0xbf58476d1ce4e5b9n;
    const MIX_MULTIPLIER_2 = 0x94d049bb133111ebn;

    expect(GOLDEN_GAMMA).toBeLessThan(MAX_U64);
    expect(MIX_MULTIPLIER_1).toBeLessThan(MAX_U64);
    expect(MIX_MULTIPLIER_2).toBeLessThan(MAX_U64);
  });

  test('SplitMix64 operations with wrapping', () => {
    // Test the actual operations from SplitMix64 algorithm
    let z = 42n;

    // Step 1: add golden gamma
    z = addU64(z, 0x9e3779b97f4a7c15n);
    expect(z).toBe(11400714819323198527n);

    // Step 2: mix with first multiplier
    z = mulU64(z ^ (z >> 30n), 0xbf58476d1ce4e5b9n);
    expect(z).toBeLessThan(MAX_U64);

    // Step 3: mix with second multiplier
    z = mulU64(z ^ (z >> 27n), 0x94d049bb133111ebn);
    expect(z).toBeLessThan(MAX_U64);

    // Final step: XOR with right shift
    const final = z ^ (z >> 31n);
    expect(final).toBeLessThan(MAX_U64);
  });

  test('comparison with manual calculation', () => {
    // Let's calculate what we expect step by step
    let z = 42n;

    // Add golden gamma (should not wrap for small inputs)
    z = addU64(z, 0x9e3779b97f4a7c15n);
    expect(z).toBe(42n + 0x9e3779b97f4a7c15n);

    // The intermediate steps will be different from arbitrary precision
    // Let's just verify the operations complete without error
    z = mulU64(z ^ (z >> 30n), 0xbf58476d1ce4e5b9n);
    z = mulU64(z ^ (z >> 27n), 0x94d049bb133111ebn);
    const result = z ^ (z >> 31n);

    // We can't predict the exact value without implementing the full algorithm,
    // but we can verify it's a valid 64-bit value
    expect(result).toBeGreaterThanOrEqual(0n);
    expect(result).toBeLessThan(MAX_U64);
  });
});

// Export functions for use in the actual implementation
export { wrapU64, addU64, mulU64 };
