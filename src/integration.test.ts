import { describe, test, expect } from 'vitest';
import { Gen } from './gen';
import { Size } from './data/size';
import { Seed as BigIntSeed } from './seed/bigint';
import { Seed as WasmSeed } from './seed/wasm';

describe('Library integration with different Seed implementations', () => {
  const size = Size.of(10);

  test('basic generators work with both seed implementations', () => {
    const bigintSeed = BigIntSeed.fromNumber(42);
    const wasmSeed = WasmSeed.fromNumber(42);

    const gen = Gen.constant(123);

    const bigintTree = gen.generate(size, bigintSeed);
    const wasmTree = gen.generate(size, wasmSeed);

    expect(bigintTree.value).toBe(123);
    expect(wasmTree.value).toBe(123);
    expect(wasmTree.value).toBe(bigintTree.value);
  });

  test('generators produce identical results with identical seeds', () => {
    const seedValue = 12345;
    const bigintSeed = BigIntSeed.fromNumber(seedValue);
    const wasmSeed = WasmSeed.fromNumber(seedValue);

    const gen = Gen.create((size, seed) => {
      const [value, newSeed] = seed.nextBounded(1000);
      return Gen.constant(value).generate(size, newSeed);
    });

    const bigintTree = gen.generate(size, bigintSeed);
    const wasmTree = gen.generate(size, wasmSeed);

    expect(wasmTree.value).toBe(bigintTree.value);
  });

  test('map and bind work identically', () => {
    const bigintSeed = BigIntSeed.fromNumber(999);
    const wasmSeed = WasmSeed.fromNumber(999);

    const gen = Gen.create((size, seed) => {
      const [value] = seed.nextBounded(100);
      return Gen.constant(value).generate(size, seed);
    })
      .map((x) => x * 2)
      .bind((x) => Gen.constant(x + 1));

    const bigintTree = gen.generate(size, bigintSeed);
    const wasmTree = gen.generate(size, wasmSeed);

    expect(wasmTree.value).toBe(bigintTree.value);
  });

  test('seed splitting produces identical generator results', () => {
    const bigintSeed = BigIntSeed.fromNumber(777);
    const wasmSeed = WasmSeed.fromNumber(777);

    const gen = Gen.create((size, seed) => {
      const [leftSeed, rightSeed] = seed.split();
      const [leftValue] = leftSeed.nextBounded(50);
      const [rightValue] = rightSeed.nextBounded(50);
      return Gen.constant([leftValue, rightValue]).generate(size, seed);
    });

    const bigintTree = gen.generate(size, bigintSeed);
    const wasmTree = gen.generate(size, wasmSeed);

    expect(wasmTree.value).toEqual(bigintTree.value);
  });

  test('complex generator chains work identically', () => {
    const bigintSeed = BigIntSeed.fromNumber(555);
    const wasmSeed = WasmSeed.fromNumber(555);

    const gen = Gen.create((size, seed) => {
      const [value1, seed1] = seed.nextBounded(10);
      const [value2, seed2] = seed1.nextBounded(10);
      const [bool, finalSeed] = seed2.nextBool();
      const result = bool ? value1 + value2 : value1 - value2;
      return Gen.constant(result).generate(size, finalSeed);
    });

    const bigintTree = gen.generate(size, bigintSeed);
    const wasmTree = gen.generate(size, wasmSeed);

    expect(wasmTree.value).toBe(bigintTree.value);
  });
});
