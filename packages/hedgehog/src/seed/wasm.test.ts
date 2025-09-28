import { describe, test, expect } from 'vitest';
import { Seed, isWasmAvailable } from './wasm.js';

describe('WASM Seed', () => {
  test('reports WASM availability', () => {
    expect(typeof isWasmAvailable()).toBe('boolean');
    expect(typeof Seed.isWasmAvailable()).toBe('boolean');
  });

  test('reports implementation type', () => {
    const impl = Seed.getImplementation();
    expect(['wasm', 'bigint']).toContain(impl);
  });

  test('creates seed from number', () => {
    const seed = Seed.fromNumber(42);
    expect(seed).toBeInstanceOf(Seed);
    // Note: state and gamma are not public in BigInt implementation
    expect(seed.toString()).toMatch(/^Seed\(/);
  });

  test('maintains same interface as BigInt implementation', () => {
    const seed = Seed.fromNumber(42);

    // Should have same methods as BigInt implementation
    expect(typeof seed.nextBounded).toBe('function');
    expect(typeof seed.nextBool).toBe('function');
    expect(typeof seed.split).toBe('function');
    expect(typeof seed.toString).toBe('function');

    // Should produce consistent results
    const [bounded, newSeed] = seed.nextBounded(100);
    expect(typeof bounded).toBe('number');
    expect(bounded).toBeGreaterThanOrEqual(0);
    expect(bounded).toBeLessThan(100);
    expect(newSeed).toBeInstanceOf(Seed);

    const [bool, newSeed2] = seed.nextBool();
    expect(typeof bool).toBe('boolean');
    expect(newSeed2).toBeInstanceOf(Seed);

    const [left, right] = seed.split();
    expect(left).toBeInstanceOf(Seed);
    expect(right).toBeInstanceOf(Seed);
    expect(left.state).not.toBe(right.state);
  });

  test('produces deterministic results', () => {
    const seed1 = Seed.fromNumber(42);
    const seed2 = Seed.fromNumber(42);

    const [value1] = seed1.nextBounded(1000);
    const [value2] = seed2.nextBounded(1000);

    expect(value1).toBe(value2);
  });

  test('toString returns string representation', () => {
    const seed = Seed.fromNumber(42);
    const str = seed.toString();
    expect(str).toBeTypeOf('string');
    expect(str).toMatch(/^Seed\(/);
  });
});
