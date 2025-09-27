import { describe, test, expect } from 'vitest';
import { Seed as BigIntSeed } from './bigint.js';
import { Seed as WasmSeed } from './wasm.js';

describe('SplitMix64 consistency between implementations', () => {
  const testCases = [
    { seed: 0, name: 'zero' },
    { seed: 1, name: 'one' },
    { seed: 42, name: 'answer' },
    { seed: 2147483647, name: 'max int32' },
    { seed: 4294967295, name: 'max uint32' },
    { seed: Number.MAX_SAFE_INTEGER, name: 'max safe integer' },
  ];

  testCases.forEach(({ seed, name }) => {
    test(`${name} (${seed}) produces identical results`, () => {
      const bigintSeed = BigIntSeed.fromNumber(seed);
      const wasmSeed = WasmSeed.fromNumber(seed);

      // Seeds should have same state and gamma
      expect(wasmSeed.state).toBe(bigintSeed.state);
      expect(wasmSeed.gamma).toBe(bigintSeed.gamma);

      // nextBounded should produce identical results
      for (const bound of [2, 10, 100, 1000, 65536]) {
        const [bigintValue, bigintNext] = bigintSeed.nextBounded(bound);
        const [wasmValue, wasmNext] = wasmSeed.nextBounded(bound);

        expect(wasmValue).toBe(bigintValue);
        expect(wasmNext.state).toBe(bigintNext.state);
        expect(wasmNext.gamma).toBe(bigintNext.gamma);
      }

      // nextBool should produce identical results
      const [bigintBool, bigintNext2] = bigintSeed.nextBool();
      const [wasmBool, wasmNext2] = wasmSeed.nextBool();

      expect(wasmBool).toBe(bigintBool);
      expect(wasmNext2.state).toBe(bigintNext2.state);
      expect(wasmNext2.gamma).toBe(bigintNext2.gamma);

      // split should produce identical results
      const [bigintLeft, bigintRight] = bigintSeed.split();
      const [wasmLeft, wasmRight] = wasmSeed.split();

      expect(wasmLeft.state).toBe(bigintLeft.state);
      expect(wasmLeft.gamma).toBe(bigintLeft.gamma);
      expect(wasmRight.state).toBe(bigintRight.state);
      expect(wasmRight.gamma).toBe(bigintRight.gamma);
    });
  });

  test('sequences produce identical results', () => {
    let bigintSeed = BigIntSeed.fromNumber(12345);
    let wasmSeed = WasmSeed.fromNumber(12345);

    // Generate 100 values and verify they're identical
    for (let i = 0; i < 100; i++) {
      const [bigintValue, bigintNext] = bigintSeed.nextBounded(1000);
      const [wasmValue, wasmNext] = wasmSeed.nextBounded(1000);

      expect(wasmValue).toBe(bigintValue);
      expect(wasmNext.state).toBe(bigintNext.state);
      expect(wasmNext.gamma).toBe(bigintNext.gamma);

      bigintSeed = bigintNext;
      wasmSeed = wasmNext;
    }
  });

  test('splitting produces independent but identical streams', () => {
    const baseSeed = 99999;
    const bigintSeed = BigIntSeed.fromNumber(baseSeed);
    const wasmSeed = WasmSeed.fromNumber(baseSeed);

    // Split both implementations
    const [bigintLeft, bigintRight] = bigintSeed.split();
    const [wasmLeft, wasmRight] = wasmSeed.split();

    // Verify splits are identical
    expect(wasmLeft.state).toBe(bigintLeft.state);
    expect(wasmLeft.gamma).toBe(bigintLeft.gamma);
    expect(wasmRight.state).toBe(bigintRight.state);
    expect(wasmRight.gamma).toBe(bigintRight.gamma);

    // Verify both streams produce identical sequences
    let bigintL = bigintLeft;
    let wasmL = wasmLeft;
    let bigintR = bigintRight;
    let wasmR = wasmRight;

    for (let i = 0; i < 50; i++) {
      // Left stream
      const [bigintLVal, bigintLNext] = bigintL.nextBounded(100);
      const [wasmLVal, wasmLNext] = wasmL.nextBounded(100);
      expect(wasmLVal).toBe(bigintLVal);

      // Right stream
      const [bigintRVal, bigintRNext] = bigintR.nextBounded(100);
      const [wasmRVal, wasmRNext] = wasmR.nextBounded(100);
      expect(wasmRVal).toBe(bigintRVal);

      bigintL = bigintLNext;
      wasmL = wasmLNext;
      bigintR = bigintRNext;
      wasmR = wasmRNext;
    }
  });

  test('toString produces identical output', () => {
    const testSeeds = [0, 1, 42, 12345, Number.MAX_SAFE_INTEGER];

    testSeeds.forEach((seedValue) => {
      const bigintSeed = BigIntSeed.fromNumber(seedValue);
      const wasmSeed = WasmSeed.fromNumber(seedValue);

      expect(wasmSeed.toString()).toBe(bigintSeed.toString());
    });
  });

  test('implementation detection works correctly', () => {
    // WASM implementation should report correct type
    // Currently returns 'bigint' as fallback, will be 'wasm' when actual WASM is loaded
    expect(['wasm', 'bigint']).toContain(WasmSeed.getImplementation());

    // Should be consistent with isWasmAvailable
    const isWasm = WasmSeed.getImplementation() === 'wasm';
    expect(WasmSeed.isWasmAvailable()).toBe(isWasm);
  });
});
