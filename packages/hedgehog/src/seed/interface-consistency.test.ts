import { describe, test, expect } from 'vitest';
import {
  Seed as SeedInterface,
  BulkSeed,
  supportsBulkOperations,
  providesImplementationInfo,
} from './interface.js';
import { Seed as BigIntSeed } from './bigint.js';
import { Seed as WasmSeed } from './wasm.js';
import { AdaptiveSeed } from './adaptive.js';

describe('Interface consistency', () => {
  test('BigIntSeed implements Seed interface', () => {
    const seed = BigIntSeed.fromNumber(42);

    // Type check - should satisfy interface
    const seedInterface: SeedInterface = seed;
    expect(seedInterface).toBeDefined();

    // Core properties
    expect(typeof seed.state).toBe('bigint');
    expect(typeof seed.gamma).toBe('bigint');

    // Single-value methods
    const [bool, newSeed] = seed.nextBool();
    expect(typeof bool).toBe('boolean');
    expect(newSeed).toBeInstanceOf(BigIntSeed);

    const [bounded, seed2] = newSeed.nextBounded(100);
    expect(typeof bounded).toBe('number');
    expect(bounded).toBeGreaterThanOrEqual(0);
    expect(bounded).toBeLessThan(100);

    const [uint32, seed3] = seed2.nextUint32();
    expect(typeof uint32).toBe('number');
    expect(uint32).toBeGreaterThanOrEqual(0);

    const [float, seed4] = seed3.nextFloat();
    expect(typeof float).toBe('number');
    expect(float).toBeGreaterThanOrEqual(0);
    expect(float).toBeLessThan(1);

    // Seed management
    const [left, right] = seed4.split();
    expect(left).toBeInstanceOf(BigIntSeed);
    expect(right).toBeInstanceOf(BigIntSeed);

    expect(typeof seed.toString()).toBe('string');
    expect(typeof seed.getImplementation()).toBe('string');
  });

  test('WasmSeed implements BulkSeed interface', () => {
    const seed = WasmSeed.fromNumber(42);

    // Type check - should satisfy BulkSeed interface
    const bulkSeed: BulkSeed = seed;
    expect(bulkSeed).toBeDefined();

    // Basic Seed interface methods
    const [bool, newSeed] = seed.nextBool();
    expect(typeof bool).toBe('boolean');
    expect(newSeed).toBeInstanceOf(WasmSeed);

    // Bulk operations
    const bulkResult = seed.nextBools(10);
    expect(bulkResult.values).toHaveLength(10);
    expect(bulkResult.values.every((v) => typeof v === 'boolean')).toBe(true);
    expect(bulkResult.finalSeed).toBeInstanceOf(WasmSeed);

    const boundedBulkResult = seed.nextBoundedBulk(5, 100);
    expect(boundedBulkResult.values).toHaveLength(5);
    expect(boundedBulkResult.values.every((v) => typeof v === 'number')).toBe(
      true
    );
    expect(boundedBulkResult.values.every((v) => v >= 0 && v < 100)).toBe(true);

    // Performance info
    const perfInfo = seed.getPerformanceInfo();
    expect(perfInfo).toBeDefined();
    expect(typeof perfInfo.implementation).toBe('string');
    expect(typeof perfInfo.batchingAvailable).toBe('boolean');
    expect(typeof perfInfo.recommendedForBulkOps).toBe('boolean');
  });

  test('AdaptiveSeed implements BulkSeed interface', () => {
    const seed = AdaptiveSeed.fromNumber(42);

    // Type check - should satisfy BulkSeed interface
    const bulkSeed: BulkSeed = seed;
    expect(bulkSeed).toBeDefined();

    // Basic Seed interface methods
    const [bool, newSeed] = seed.nextBool();
    expect(typeof bool).toBe('boolean');
    expect(newSeed).toBeInstanceOf(AdaptiveSeed);

    // Bulk operations
    const bulkResult = seed.nextBools(10);
    expect(bulkResult.values).toHaveLength(10);
    expect(bulkResult.values.every((v) => typeof v === 'boolean')).toBe(true);
    expect(bulkResult.finalSeed).toBeInstanceOf(AdaptiveSeed);

    const boundedBulkResult = seed.nextBoundedBulk(5, 100);
    expect(boundedBulkResult.values).toHaveLength(5);
    expect(boundedBulkResult.values.every((v) => typeof v === 'number')).toBe(
      true
    );

    // Performance info
    const perfInfo = seed.getPerformanceInfo();
    expect(perfInfo).toBeDefined();
    expect(typeof perfInfo.implementation).toBe('string');
    expect(typeof perfInfo.batchingAvailable).toBe('boolean');
    expect(typeof perfInfo.recommendedForBulkOps).toBe('boolean');
  });

  test('type guards work correctly', () => {
    const bigintSeed = BigIntSeed.fromNumber(42);
    const wasmSeed = WasmSeed.fromNumber(42);
    const adaptiveSeed = AdaptiveSeed.fromNumber(42);

    // BigInt seed doesn't support bulk operations
    expect(supportsBulkOperations(bigintSeed)).toBe(false);

    // WASM and Adaptive seeds do support bulk operations
    expect(supportsBulkOperations(wasmSeed)).toBe(true);
    expect(supportsBulkOperations(adaptiveSeed)).toBe(true);

    // All seeds provide implementation info
    expect(providesImplementationInfo(bigintSeed)).toBe(true);
    expect(providesImplementationInfo(wasmSeed)).toBe(true);
    expect(providesImplementationInfo(adaptiveSeed)).toBe(true);
  });

  test('interface polymorphism works correctly', () => {
    const seeds: SeedInterface[] = [
      BigIntSeed.fromNumber(42),
      WasmSeed.fromNumber(42),
      AdaptiveSeed.fromNumber(42),
    ];

    // All seeds can be used polymorphically
    for (const seed of seeds) {
      const [bool, newSeed] = seed.nextBool();
      expect(typeof bool).toBe('boolean');
      expect(newSeed).toBeDefined();

      const [bounded, _seed2] = newSeed.nextBounded(100);
      expect(typeof bounded).toBe('number');
      expect(bounded).toBeGreaterThanOrEqual(0);
      expect(bounded).toBeLessThan(100);

      expect(typeof seed.toString()).toBe('string');

      if (providesImplementationInfo(seed)) {
        expect(typeof seed.getImplementation()).toBe('string');
      }

      if (supportsBulkOperations(seed)) {
        const bulkResult = seed.nextBools(5);
        expect(bulkResult.values).toHaveLength(5);
        expect(bulkResult.values.every((v) => typeof v === 'boolean')).toBe(
          true
        );
      }
    }
  });
});
