import { describe, test, expect } from 'vitest';
import { AdaptiveSeed } from './adaptive.js';

describe('AdaptiveSeed', () => {
  test('creates seed successfully', () => {
    const seed = AdaptiveSeed.fromNumber(42);
    expect(seed).toBeDefined();
    expect(seed.state).toBeDefined();
    expect(seed.gamma).toBeDefined();
  });

  test('reports implementation type', () => {
    const seed = AdaptiveSeed.fromNumber(42);
    const impl = seed.getImplementation();
    expect(['wasm', 'bigint', 'bigint-fallback']).toContain(impl);
  });

  test('single operations work correctly', () => {
    const seed = AdaptiveSeed.fromNumber(42);

    // Boolean generation
    const [bool, newSeed] = seed.nextBool();
    expect(typeof bool).toBe('boolean');
    expect(newSeed).toBeInstanceOf(AdaptiveSeed);
    expect(newSeed.state).not.toBe(seed.state);

    // Bounded generation
    const [value, seed2] = newSeed.nextBounded(100);
    expect(typeof value).toBe('number');
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(100);
    expect(seed2).toBeInstanceOf(AdaptiveSeed);
  });

  test('seed splitting works correctly', () => {
    const seed = AdaptiveSeed.fromNumber(42);
    const [left, right] = seed.split();

    expect(left).toBeInstanceOf(AdaptiveSeed);
    expect(right).toBeInstanceOf(AdaptiveSeed);
    expect(left.state).not.toBe(right.state);
    expect(left.state).not.toBe(seed.state);
    expect(right.state).not.toBe(seed.state);
  });

  test('bulk boolean generation works', () => {
    const seed = AdaptiveSeed.fromNumber(42);

    // Small bulk (should use individual calls)
    const smallResult = seed.nextBools(5);
    expect(smallResult.values).toHaveLength(5);
    expect(smallResult.values.every((v) => typeof v === 'boolean')).toBe(true);
    expect(smallResult.finalSeed).toBeInstanceOf(AdaptiveSeed);

    // Large bulk (should use batching when WASM available)
    const largeResult = seed.nextBools(100);
    expect(largeResult.values).toHaveLength(100);
    expect(largeResult.values.every((v) => typeof v === 'boolean')).toBe(true);
    expect(largeResult.finalSeed).toBeInstanceOf(AdaptiveSeed);
  });

  test('bulk bounded generation works', () => {
    const seed = AdaptiveSeed.fromNumber(42);

    const result = seed.nextBoundedBulk(50, 100);
    expect(result.values).toHaveLength(50);
    expect(result.values.every((v) => typeof v === 'number')).toBe(true);
    expect(result.values.every((v) => v >= 0 && v < 100)).toBe(true);
    expect(result.finalSeed).toBeInstanceOf(AdaptiveSeed);
  });

  test('deterministic results with same seed', () => {
    const seed1 = AdaptiveSeed.fromNumber(12345);
    const seed2 = AdaptiveSeed.fromNumber(12345);

    const [bool1, newSeed1] = seed1.nextBool();
    const [bool2, newSeed2] = seed2.nextBool();

    expect(bool1).toBe(bool2);
    expect(newSeed1.state).toBe(newSeed2.state);
    expect(newSeed1.gamma).toBe(newSeed2.gamma);
  });

  test('bulk operations are deterministic', () => {
    const seed1 = AdaptiveSeed.fromNumber(12345);
    const seed2 = AdaptiveSeed.fromNumber(12345);

    const result1 = seed1.nextBools(20);
    const result2 = seed2.nextBools(20);

    expect(result1.values).toEqual(result2.values);
    expect(result1.finalSeed.state).toBe(result2.finalSeed.state);
  });

  test('toString matches standard format', () => {
    const seed = AdaptiveSeed.fromNumber(42);
    const str = seed.toString();

    expect(str).toMatch(/^Seed\(\d+, \d+\)$/);
  });

  test('toStringWithImpl includes implementation info', () => {
    const seed = AdaptiveSeed.fromNumber(42);
    const str = seed.toStringWithImpl();

    expect(str).toMatch(
      /AdaptiveSeed\(\d+, \d+\) \[(wasm|bigint|bigint-fallback)\]/
    );
  });

  test('performance info is available', () => {
    const seed = AdaptiveSeed.fromNumber(42);
    const perfInfo = seed.getPerformanceInfo();

    expect(perfInfo).toHaveProperty('implementation');
    expect(perfInfo).toHaveProperty('batchingAvailable');
    expect(perfInfo).toHaveProperty('recommendedForBulkOps');
    expect(['wasm', 'bigint', 'bigint-fallback']).toContain(
      perfInfo.implementation
    );
    expect(typeof perfInfo.batchingAvailable).toBe('boolean');
    expect(typeof perfInfo.recommendedForBulkOps).toBe('boolean');
  });

  test('forced BigInt implementation works', () => {
    const seed = AdaptiveSeed.fromNumberBigInt(42);
    expect(seed.getImplementation()).toBe('bigint');

    const [bool, newSeed] = seed.nextBool();
    expect(typeof bool).toBe('boolean');
    expect(newSeed.getImplementation()).toBe('bigint');
  });

  test('batching threshold is respected', () => {
    const seed = AdaptiveSeed.fromNumber(42);

    // Small operations should still work efficiently
    const start = performance.now();
    const result = seed.nextBools(5);
    const time = performance.now() - start;

    expect(result.values).toHaveLength(5);
    expect(time).toBeLessThan(10); // Should be very fast
  });

  test('consistency with individual vs bulk operations', () => {
    const seed = AdaptiveSeed.fromNumber(54321);

    // Generate 10 booleans individually
    let currentSeed = seed;
    const individualResults: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      const [bool, newSeed] = currentSeed.nextBool();
      individualResults.push(bool);
      currentSeed = newSeed;
    }

    // Generate 10 booleans in bulk
    const bulkResult = seed.nextBools(10);

    // Results should be identical
    expect(bulkResult.values).toEqual(individualResults);
    expect(bulkResult.finalSeed.state).toBe(currentSeed.state);
    expect(bulkResult.finalSeed.gamma).toBe(currentSeed.gamma);
  });
});
