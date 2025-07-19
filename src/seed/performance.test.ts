import { describe, test } from 'vitest';
import * as BigIntSeed from './bigint.js';
import * as WasmSeed from './wasm.js';

describe('SplitMix64 performance comparison', () => {
  const ITERATIONS = 100_000;
  const WARMUP_ITERATIONS = 1_000;

  function benchmark(
    name: string,
    fn: () => void,
    iterations: number = ITERATIONS
  ): number {
    // Warmup
    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
      fn();
    }

    // Actual benchmark
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const end = performance.now();

    const totalTime = end - start;
    const opsPerSecond = iterations / (totalTime / 1000);

    console.log(`${name}:`);
    console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
    console.log(`  Operations/sec: ${opsPerSecond.toLocaleString()}`);
    console.log(
      `  Time per op: ${((totalTime / iterations) * 1000).toFixed(3)}μs`
    );
    console.log('');

    return opsPerSecond;
  }

  test('constructor performance', () => {
    const seed = 42;

    console.log(
      `Constructor performance (${ITERATIONS.toLocaleString()} iterations):`
    );
    console.log('');

    const bigintOps = benchmark('BigInt constructor', () => {
      BigIntSeed.Seed.fromNumber(seed);
    });

    const wasmOps = benchmark('WASM constructor', () => {
      WasmSeed.Seed.fromNumber(seed);
    });

    const speedup = wasmOps / bigintOps;
    console.log(
      `WASM is ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'} than BigInt`
    );
  });

  test('nextBounded performance', () => {
    const bigintSeed = BigIntSeed.Seed.fromNumber(42);
    const wasmSeed = WasmSeed.Seed.fromNumber(42);
    const bound = 100;

    console.log(
      `nextBounded performance (${ITERATIONS.toLocaleString()} iterations):`
    );
    console.log('');

    let currentBigint = bigintSeed;
    const bigintOps = benchmark('BigInt nextBounded', () => {
      const [, newSeed] = currentBigint.nextBounded(bound);
      currentBigint = newSeed;
    });

    let currentWasm = wasmSeed;
    const wasmOps = benchmark('WASM nextBounded', () => {
      const [, newSeed] = currentWasm.nextBounded(bound);
      currentWasm = newSeed;
    });

    const speedup = wasmOps / bigintOps;
    console.log(
      `WASM is ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'} than BigInt`
    );
  });

  test('nextBool performance', () => {
    const bigintSeed = BigIntSeed.Seed.fromNumber(42);
    const wasmSeed = WasmSeed.Seed.fromNumber(42);

    console.log(
      `nextBool performance (${ITERATIONS.toLocaleString()} iterations):`
    );
    console.log('');

    let currentBigint = bigintSeed;
    const bigintOps = benchmark('BigInt nextBool', () => {
      const [, newSeed] = currentBigint.nextBool();
      currentBigint = newSeed;
    });

    let currentWasm = wasmSeed;
    const wasmOps = benchmark('WASM nextBool', () => {
      const [, newSeed] = currentWasm.nextBool();
      currentWasm = newSeed;
    });

    const speedup = wasmOps / bigintOps;
    console.log(
      `WASM is ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'} than BigInt`
    );
  });

  test('split performance', () => {
    const bigintSeed = BigIntSeed.Seed.fromNumber(42);
    const wasmSeed = WasmSeed.Seed.fromNumber(42);

    console.log(
      `split performance (${ITERATIONS.toLocaleString()} iterations):`
    );
    console.log('');

    let currentBigint = bigintSeed;
    const bigintOps = benchmark('BigInt split', () => {
      const [left, right] = currentBigint.split();
      currentBigint = left;
    });

    let currentWasm = wasmSeed;
    const wasmOps = benchmark('WASM split', () => {
      const [left, right] = currentWasm.split();
      currentWasm = left;
    });

    const speedup = wasmOps / bigintOps;
    console.log(
      `WASM is ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'} than BigInt`
    );
  });

  test('mixed workload performance', () => {
    const bigintSeed = BigIntSeed.Seed.fromNumber(42);
    const wasmSeed = WasmSeed.Seed.fromNumber(42);

    console.log(
      `Mixed workload performance (${ITERATIONS.toLocaleString()} iterations):`
    );
    console.log('');

    let currentBigint = bigintSeed;
    const bigintOps = benchmark('BigInt mixed workload', () => {
      const [bound, seed1] = currentBigint.nextBounded(100);
      const [bool, seed2] = seed1.nextBool();
      const [left, right] = seed2.split();
      currentBigint = bool ? left : right;
    });

    let currentWasm = wasmSeed;
    const wasmOps = benchmark('WASM mixed workload', () => {
      const [bound, seed1] = currentWasm.nextBounded(100);
      const [bool, seed2] = seed1.nextBool();
      const [left, right] = seed2.split();
      currentWasm = bool ? left : right;
    });

    const speedup = wasmOps / bigintOps;
    console.log(
      `WASM is ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'} than BigInt`
    );
  });
});
