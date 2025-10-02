import { describe, test, expect } from 'vitest';
import { Seed } from '../index.js';

describe('Seed.nextBounded parameter validation', () => {
  test('rejects undefined bound with diagnostic error instead of BigInt conversion failure', () => {
    const seed = Seed.fromNumber(42);

    expect(() => {
      // @ts-expect-error - intentionally passing undefined to test runtime behavior
      seed.nextBounded(undefined);
    }).toThrow(/Invalid bound parameter: undefined.*API usage error/);
  });

  test('rejects null bound with diagnostic error', () => {
    const seed = Seed.fromNumber(42);

    expect(() => {
      // @ts-expect-error - intentionally passing null to test runtime behavior
      seed.nextBounded(null);
    }).toThrow(/Invalid bound parameter: null.*API usage error/);
  });

  test('rejects negative bound with diagnostic error', () => {
    const seed = Seed.fromNumber(42);

    expect(() => {
      seed.nextBounded(-5);
    }).toThrow(/Invalid bound parameter: -5[\s\S]*negative bounds/);
  });

  test('rejects NaN bound with diagnostic error', () => {
    const seed = Seed.fromNumber(42);

    expect(() => {
      seed.nextBounded(NaN);
    }).toThrow(/Invalid bound parameter: NaN.*API usage error/);
  });

  test('accepts valid positive bound and returns correct range', () => {
    const seed = Seed.fromNumber(42);

    const [value, newSeed] = seed.nextBounded(100);

    expect(typeof value).toBe('number');
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(100);
    expect(newSeed).toBeInstanceOf(Seed);
  });
});
