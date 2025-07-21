import { describe, test, expect } from 'vitest';
import { Gen } from './gen';
import { Size } from './data/size';
import { Seed } from './data/seed'; // AdaptiveSeed - works with both WASM and BigInt
import { AdaptiveSeed } from './seed/adaptive';

describe('Library integration with AdaptiveSeed', () => {
  const size = Size.of(10);

  test('basic generators work with adaptive seed', () => {
    const seed1 = Seed.fromNumber(42);
    const seed2 = AdaptiveSeed.fromNumber(42);

    const gen = Gen.constant(123);

    const tree1 = gen.generate(size, seed1);
    const tree2 = gen.generate(size, seed2);

    expect(tree1.value).toBe(123);
    expect(tree2.value).toBe(123);
    expect(tree1.value).toBe(tree2.value);
  });

  test('generators produce identical results with identical seeds', () => {
    const seedValue = 12345;

    const seed1 = Seed.fromNumber(seedValue);
    const seed2 = AdaptiveSeed.fromNumber(seedValue);

    const gen = Gen.create((size, seed) => {
      const [value, newSeed] = seed.nextBounded(1000);
      return Gen.constant(value).generate(size, newSeed);
    });

    const tree1 = gen.generate(size, seed1);
    const tree2 = gen.generate(size, seed2);

    expect(tree1.value).toBe(tree2.value);
  });

  test('map and bind work correctly', () => {
    const seed = Seed.fromNumber(999);

    const gen = Gen.create((size, seed) => {
      const [value] = seed.nextBounded(100);
      return Gen.constant(value).generate(size, seed);
    })
      .map((x) => x * 2)
      .bind((x) => Gen.constant(x + 1));

    const tree = gen.generate(size, seed);

    // Verify the transformation chain worked
    expect(typeof tree.value).toBe('number');
    expect(tree.value).toBeGreaterThan(0); // Should be some positive number after transformations
  });

  test('seed splitting works in generators', () => {
    const seed = Seed.fromNumber(777);

    const gen = Gen.create((size, seed) => {
      const [leftSeed, rightSeed] = seed.split();
      const [leftValue] = leftSeed.nextBounded(50);
      const [rightValue] = rightSeed.nextBounded(50);
      return Gen.constant([leftValue, rightValue]).generate(size, seed);
    });

    const tree = gen.generate(size, seed);

    expect(Array.isArray(tree.value)).toBe(true);
    expect(tree.value).toHaveLength(2);
    expect(typeof tree.value[0]).toBe('number');
    expect(typeof tree.value[1]).toBe('number');
    expect(tree.value[0]).toBeGreaterThanOrEqual(0);
    expect(tree.value[0]).toBeLessThan(50);
    expect(tree.value[1]).toBeGreaterThanOrEqual(0);
    expect(tree.value[1]).toBeLessThan(50);
  });

  test('complex generator chains work correctly', () => {
    const seed = Seed.fromNumber(555);

    const gen = Gen.create((size, seed) => {
      const [value1, seed1] = seed.nextBounded(10);
      const [value2, seed2] = seed1.nextBounded(10);
      const [bool, finalSeed] = seed2.nextBool();
      const result = bool ? value1 + value2 : value1 - value2;
      return Gen.constant(result).generate(size, finalSeed);
    });

    const tree = gen.generate(size, seed);

    expect(typeof tree.value).toBe('number');
    // Result should be between -10 and 19 (worst case: 0-9 or 9+9)
    expect(tree.value).toBeGreaterThanOrEqual(-10);
    expect(tree.value).toBeLessThanOrEqual(19);
  });

  test('adaptive seed reports implementation info', () => {
    const seed = Seed.fromNumber(42);

    expect(seed.getImplementation()).toBeDefined();
    expect(['wasm', 'bigint', 'bigint-fallback']).toContain(
      seed.getImplementation()
    );

    const perfInfo = seed.getPerformanceInfo();
    expect(perfInfo).toBeDefined();
    expect(typeof perfInfo.implementation).toBe('string');
    expect(typeof perfInfo.batchingAvailable).toBe('boolean');
    expect(typeof perfInfo.recommendedForBulkOps).toBe('boolean');
  });

  test('bulk operations work in adaptive context', () => {
    const seed = Seed.fromNumber(42);

    // Test bulk boolean generation
    const boolResult = seed.nextBools(10);
    expect(boolResult.values).toHaveLength(10);
    expect(boolResult.values.every((v) => typeof v === 'boolean')).toBe(true);
    expect(boolResult.finalSeed).toBeInstanceOf(AdaptiveSeed);

    // Test bulk bounded generation
    const boundedResult = seed.nextBoundedBulk(5, 100);
    expect(boundedResult.values).toHaveLength(5);
    expect(boundedResult.values.every((v) => typeof v === 'number')).toBe(true);
    expect(boundedResult.values.every((v) => v >= 0 && v < 100)).toBe(true);
    expect(boundedResult.finalSeed).toBeInstanceOf(AdaptiveSeed);
  });
});
