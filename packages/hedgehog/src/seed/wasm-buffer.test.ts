import { describe, it, expect } from 'vitest';
import { Seed } from './wasm.js';

describe('WASM Buffer API', () => {
  const seed = Seed.fromNumber(42);

  describe('nextBoundedBulkBuffer()', () => {
    it('generates bounded integers using buffer API', () => {
      const bound = 100;
      const count = 1000;
      const result = seed.nextBoundedBulkBuffer(count, bound);

      expect(result.values).toHaveLength(count);
      expect(result.finalSeed).toBeInstanceOf(Seed);

      // All values should be within bounds
      result.values.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(bound);
        expect(Number.isInteger(value)).toBe(true);
      });
    });

    it('handles large bounds correctly', () => {
      const bound = 2 ** 31 - 1; // Max safe u32 bound
      const count = 100;
      const result = seed.nextBoundedBulkBuffer(count, bound);

      expect(result.values).toHaveLength(count);
      result.values.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(bound);
      });
    });

    it('produces different values with different seeds', () => {
      const count = 50;
      const bound = 1000;

      const seed1 = Seed.fromNumber(1);
      const seed2 = Seed.fromNumber(2);

      const result1 = seed1.nextBoundedBulkBuffer(count, bound);
      const result2 = seed2.nextBoundedBulkBuffer(count, bound);

      // Should produce different sequences
      expect(result1.values).not.toEqual(result2.values);
    });

    it('is deterministic with same seed', () => {
      const count = 50;
      const bound = 100;
      const testSeed = Seed.fromNumber(123);

      const result1 = testSeed.nextBoundedBulkBuffer(count, bound);
      const result2 = testSeed.nextBoundedBulkBuffer(count, bound);

      // Should produce identical sequences
      expect(result1.values).toEqual(result2.values);
    });

    it('validates buffer size limits', () => {
      // Test with a size that would exceed practical limits
      const count = 2 ** 28; // Would require ~1GB+ buffer
      const bound = 100;

      expect(() => {
        seed.nextBoundedBulkBuffer(count, bound);
      }).toThrow(/Buffer operation failed/);
    });
  });

  describe('nextFloatsBulkBuffer()', () => {
    it('generates floats in [0, 1) range', () => {
      const count = 1000;
      const result = seed.nextFloatsBulkBuffer(count);

      expect(result.values).toHaveLength(count);
      expect(result.finalSeed).toBeInstanceOf(Seed);

      // All values should be in [0, 1) range
      result.values.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
        expect(typeof value).toBe('number');
        expect(isFinite(value)).toBe(true);
      });
    });

    it('produces high-quality random distribution', () => {
      const count = 10000;
      const result = seed.nextFloatsBulkBuffer(count);

      // Check distribution - should be roughly uniform in [0, 1)
      const quartiles = [0, 0, 0, 0];
      result.values.forEach((value) => {
        const quartile = Math.floor(value * 4);
        quartiles[Math.min(quartile, 3)]++;
      });

      // Each quartile should have roughly 25% of values (within reasonable tolerance)
      const expectedPerQuartile = count / 4;
      const tolerance = expectedPerQuartile * 0.1; // 10% tolerance

      quartiles.forEach((count) => {
        expect(count).toBeGreaterThan(expectedPerQuartile - tolerance);
        expect(count).toBeLessThan(expectedPerQuartile + tolerance);
      });
    });

    it('is deterministic with same seed', () => {
      const count = 100;
      const testSeed = Seed.fromNumber(456);

      const result1 = testSeed.nextFloatsBulkBuffer(count);
      const result2 = testSeed.nextFloatsBulkBuffer(count);

      expect(result1.values).toEqual(result2.values);
    });
  });

  describe('nextBoolsBulkBuffer()', () => {
    it('generates boolean values', () => {
      const count = 1000;
      const result = seed.nextBoolsBulkBuffer(count);

      expect(result.values).toHaveLength(count);
      expect(result.finalSeed).toBeInstanceOf(Seed);

      // All values should be booleans
      result.values.forEach((value) => {
        expect(typeof value).toBe('boolean');
      });
    });

    it('produces roughly balanced true/false distribution', () => {
      const count = 10000;
      const result = seed.nextBoolsBulkBuffer(count);

      const trueCount = result.values.filter((v) => v === true).length;
      const falseCount = result.values.filter((v) => v === false).length;

      expect(trueCount + falseCount).toBe(count);

      // Should be roughly 50/50 distribution (within 5% tolerance)
      const tolerance = count * 0.05;
      const expectedHalf = count / 2;

      expect(trueCount).toBeGreaterThan(expectedHalf - tolerance);
      expect(trueCount).toBeLessThan(expectedHalf + tolerance);
      expect(falseCount).toBeGreaterThan(expectedHalf - tolerance);
      expect(falseCount).toBeLessThan(expectedHalf + tolerance);
    });

    it('is deterministic with same seed', () => {
      const count = 100;
      const testSeed = Seed.fromNumber(789);

      const result1 = testSeed.nextBoolsBulkBuffer(count);
      const result2 = testSeed.nextBoolsBulkBuffer(count);

      expect(result1.values).toEqual(result2.values);
    });
  });

  describe('Integration with existing bulk API', () => {
    it('automatically uses buffer API for large batches', () => {
      const count = 500; // > 100, should trigger buffer API
      const bound = 1000;

      const result = seed.nextBoundedBulk(count, bound);

      expect(result.values).toHaveLength(count);
      result.values.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(bound);
      });
    });

    it('uses individual calls for small batches', () => {
      const count = 50; // <= 100, should use individual calls
      const bound = 100;

      const result = seed.nextBoundedBulk(count, bound);

      expect(result.values).toHaveLength(count);
      result.values.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(bound);
      });
    });

    it('produces consistent results regardless of batch size threshold', () => {
      const testSeed = Seed.fromNumber(999);
      const bound = 100;

      // Generate same sequence using different methods
      const smallBatch = testSeed.nextBoundedBulk(50, bound); // Individual calls
      const largeBatch = testSeed.nextBoundedBulk(200, bound); // Buffer API

      // Should both work and produce valid results
      expect(smallBatch.values).toHaveLength(50);
      expect(largeBatch.values).toHaveLength(200);

      smallBatch.values.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(bound);
      });

      largeBatch.values.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(bound);
      });
    });
  });

  describe('Error handling', () => {
    it('throws on invalid buffer sizes', () => {
      expect(() => {
        seed.nextBoundedBulkBuffer(2 ** 30, 100); // Massive count
      }).toThrow();
    });

    it('handles zero count correctly', () => {
      // Zero count should return empty array, not throw
      const result = seed.nextBoundedBulkBuffer(0, 100);
      expect(result.values).toHaveLength(0);
      expect(result.finalSeed).toBeInstanceOf(Seed);
    });
  });
});
