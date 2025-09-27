import { describe, test, expect } from 'vitest';
import { Seed } from './seed.js';

describe('Seed', () => {
  test('creates seed from number', () => {
    const seed = Seed.fromNumber(42);
    expect(seed.toString()).toMatch(/^Seed\(\d+, \d+\)$/);
  });

  test('creates random seed', () => {
    const seed1 = Seed.random();
    const seed2 = Seed.random();
    expect(seed1.toString()).not.toBe(seed2.toString());
  });

  test('splits seed into two independent seeds', () => {
    const originalSeed = Seed.fromNumber(42);
    const [seed1, seed2] = originalSeed.split();

    expect(seed1.toString()).not.toBe(seed2.toString());
    expect(seed1.toString()).not.toBe(originalSeed.toString());
    expect(seed2.toString()).not.toBe(originalSeed.toString());
  });

  test('generates deterministic values', () => {
    const seed = Seed.fromNumber(42);
    const [value1, newSeed1] = seed.nextUint32();
    const [value2, newSeed2] = seed.nextUint32();

    expect(value1).toBe(value2);
    expect(newSeed1.toString()).toBe(newSeed2.toString());
  });

  test('generates different values with different seeds', () => {
    const seed1 = Seed.fromNumber(42);
    const seed2 = Seed.fromNumber(43);

    const [value1] = seed1.nextUint32();
    const [value2] = seed2.nextUint32();

    expect(value1).not.toBe(value2);
  });

  test('generates bounded values', () => {
    const seed = Seed.fromNumber(42);
    const [value, newSeed] = seed.nextBounded(10);

    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(10);
    expect(newSeed.toString()).not.toBe(seed.toString());
  });

  test('generates boolean values', () => {
    const seed = Seed.fromNumber(42);
    const [bool, newSeed] = seed.nextBool();

    expect(typeof bool).toBe('boolean');
    expect(newSeed.toString()).not.toBe(seed.toString());
  });

  test('generates float values', () => {
    const seed = Seed.fromNumber(42);
    const [float, newSeed] = seed.nextFloat();

    expect(float).toBeGreaterThanOrEqual(0);
    expect(float).toBeLessThan(1);
    expect(newSeed.toString()).not.toBe(seed.toString());
  });
});
