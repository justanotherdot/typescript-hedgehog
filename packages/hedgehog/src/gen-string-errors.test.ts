import { describe, test, expect } from 'vitest';
import { Gen, Range } from './index.js';

describe('Gen.string parameter validation and convenience methods', () => {
  test('rejects invalid Range parameter with helpful error message', () => {
    expect(() => {
      // @ts-expect-error - intentionally passing invalid parameter to test runtime behavior
      Gen.string(Range.uniform(5, 15));
    }).toThrow(/Gen\.string\(\) does not accept parameters/);
  });

  test('rejects multiple parameters with helpful error message', () => {
    expect(() => {
      // @ts-expect-error - intentionally passing invalid parameters
      Gen.string('invalid', 123);
    }).toThrow(/Gen\.string\(\) does not accept parameters/);
  });

  test('Gen.stringBetween(min, max) generates strings within bounds', () => {
    const gen = Gen.stringBetween(5, 10);
    const result = gen.sample();

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThanOrEqual(5);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  test('Gen.stringOfRange(range) generates strings within range bounds', () => {
    const gen = Gen.stringOfRange(Range.uniform(3, 7));
    const result = gen.sample();

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(7);
  });

  test('Gen.string() without parameters continues to work as before', () => {
    const gen = Gen.string();
    const result = gen.sample();

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});
