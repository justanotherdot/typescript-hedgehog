import { describe, test } from 'vitest';
import * as BigIntSeed from './bigint.js';
import * as WasmSeed from './wasm.js';

const runProfiling = process.env.RUN_PROFILING === 'true';

describe.skipIf(!runProfiling)('Performance profiling', () => {
  const ITERATIONS = 50_000;

  function profileOperation(name: string, fn: () => void) {
    console.log(`\n=== Profiling ${name} ===`);

    // Mark start
    performance.mark(`${name}-start`);

    for (let i = 0; i < ITERATIONS; i++) {
      fn();
    }

    // Mark end
    performance.mark(`${name}-end`);
    performance.measure(name, `${name}-start`, `${name}-end`);

    const measure = performance.getEntriesByName(name)[0];
    console.log(`Total time: ${measure.duration.toFixed(2)}ms`);
    console.log(
      `Time per op: ${((measure.duration / ITERATIONS) * 1000).toFixed(3)}μs`
    );

    return measure.duration;
  }

  function profileDetailed(
    name: string,
    setup: () => any,
    operation: (state: any) => any
  ) {
    console.log(`\n=== Detailed profiling ${name} ===`);

    // Setup overhead
    performance.mark(`${name}-setup-start`);
    const initialState = setup();
    performance.mark(`${name}-setup-end`);
    performance.measure(
      `${name}-setup`,
      `${name}-setup-start`,
      `${name}-setup-end`
    );

    // Operation with state tracking
    let currentState = initialState;
    performance.mark(`${name}-ops-start`);

    for (let i = 0; i < ITERATIONS; i++) {
      performance.mark(`${name}-op-${i}-start`);
      currentState = operation(currentState);
      performance.mark(`${name}-op-${i}-end`);

      // Sample detailed timing every 10k operations
      if (i % 10000 === 0 && i > 0) {
        performance.measure(
          `${name}-op-${i}`,
          `${name}-op-${i}-start`,
          `${name}-op-${i}-end`
        );
      }
    }

    performance.mark(`${name}-ops-end`);
    performance.measure(
      `${name}-operations`,
      `${name}-ops-start`,
      `${name}-ops-end`
    );

    // Report results
    const setupTime =
      performance.getEntriesByName(`${name}-setup`)[0]?.duration || 0;
    const opsTime =
      performance.getEntriesByName(`${name}-operations`)[0]?.duration || 0;

    console.log(`Setup time: ${setupTime.toFixed(3)}ms`);
    console.log(`Operations time: ${opsTime.toFixed(2)}ms`);
    console.log(`Time per op: ${((opsTime / ITERATIONS) * 1000).toFixed(3)}μs`);

    return { setupTime, opsTime, totalTime: setupTime + opsTime };
  }

  test('constructor profiling', () => {
    console.log(
      `Constructor profiling (${ITERATIONS.toLocaleString()} iterations)`
    );

    const bigintTime = profileOperation('BigInt constructor', () => {
      BigIntSeed.Seed.fromNumber(42);
    });

    const wasmTime = profileOperation('WASM constructor', () => {
      WasmSeed.Seed.fromNumber(42);
    });

    console.log(`\nSpeedup: ${(bigintTime / wasmTime).toFixed(2)}x`);
  });

  test('nextBool detailed profiling', () => {
    console.log(
      `NextBool detailed profiling (${ITERATIONS.toLocaleString()} iterations)`
    );

    const bigintResults = profileDetailed(
      'BigInt nextBool',
      () => BigIntSeed.Seed.fromNumber(42),
      (seed) => {
        const [, newSeed] = seed.nextBool();
        return newSeed;
      }
    );

    const wasmResults = profileDetailed(
      'WASM nextBool',
      () => WasmSeed.Seed.fromNumber(42),
      (seed) => {
        const [, newSeed] = seed.nextBool();
        return newSeed;
      }
    );

    console.log(`\n=== Comparison ===`);
    console.log(`BigInt total: ${bigintResults.totalTime.toFixed(2)}ms`);
    console.log(`WASM total: ${wasmResults.totalTime.toFixed(2)}ms`);
    console.log(
      `Speedup: ${(bigintResults.totalTime / wasmResults.totalTime).toFixed(2)}x`
    );
  });

  test('split detailed profiling', () => {
    console.log(
      `Split detailed profiling (${ITERATIONS.toLocaleString()} iterations)`
    );

    const bigintResults = profileDetailed(
      'BigInt split',
      () => BigIntSeed.Seed.fromNumber(42),
      (seed) => {
        const [left, right] = seed.split();
        return left;
      }
    );

    const wasmResults = profileDetailed(
      'WASM split',
      () => WasmSeed.Seed.fromNumber(42),
      (seed) => {
        const [left, right] = seed.split();
        return left;
      }
    );

    console.log(`\n=== Comparison ===`);
    console.log(`BigInt total: ${bigintResults.totalTime.toFixed(2)}ms`);
    console.log(`WASM total: ${wasmResults.totalTime.toFixed(2)}ms`);
    console.log(
      `Speedup: ${(wasmResults.totalTime / bigintResults.totalTime).toFixed(2)}x (BigInt faster)`
    );
  });

  test('memory allocation profiling', () => {
    console.log(
      `Memory allocation profiling (${ITERATIONS.toLocaleString()} iterations)`
    );

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const memBefore = process.memoryUsage();

    profileOperation('BigInt memory test', () => {
      const seed = BigIntSeed.Seed.fromNumber(42);
      const [, newSeed] = seed.nextBool();
      const [left, right] = newSeed.split();
    });

    if (global.gc) {
      global.gc();
    }

    const memMiddle = process.memoryUsage();

    profileOperation('WASM memory test', () => {
      const seed = WasmSeed.Seed.fromNumber(42);
      const [, newSeed] = seed.nextBool();
      const [left, right] = newSeed.split();
    });

    if (global.gc) {
      global.gc();
    }

    const memAfter = process.memoryUsage();

    console.log(`\n=== Memory Usage ===`);
    console.log(
      `BigInt heap delta: ${((memMiddle.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2)}MB`
    );
    console.log(
      `WASM heap delta: ${((memAfter.heapUsed - memMiddle.heapUsed) / 1024 / 1024).toFixed(2)}MB`
    );
  });

  test('performance timeline export', () => {
    console.log('\n=== Performance Timeline ===');

    // Clear previous marks
    performance.clearMarks();
    performance.clearMeasures();

    // Run a mixed workload with detailed marks
    const seed = BigIntSeed.Seed.fromNumber(42);

    performance.mark('bigint-workflow-start');

    performance.mark('bigint-constructor-start');
    const bigintSeed = BigIntSeed.Seed.fromNumber(123);
    performance.mark('bigint-constructor-end');
    performance.measure(
      'bigint-constructor',
      'bigint-constructor-start',
      'bigint-constructor-end'
    );

    performance.mark('bigint-nextbool-start');
    const [bool, seed1] = bigintSeed.nextBool();
    performance.mark('bigint-nextbool-end');
    performance.measure(
      'bigint-nextbool',
      'bigint-nextbool-start',
      'bigint-nextbool-end'
    );

    performance.mark('bigint-split-start');
    const [left, right] = seed1.split();
    performance.mark('bigint-split-end');
    performance.measure(
      'bigint-split',
      'bigint-split-start',
      'bigint-split-end'
    );

    performance.mark('bigint-workflow-end');
    performance.measure(
      'bigint-workflow',
      'bigint-workflow-start',
      'bigint-workflow-end'
    );

    // WASM workflow
    performance.mark('wasm-workflow-start');

    performance.mark('wasm-constructor-start');
    const wasmSeed = WasmSeed.Seed.fromNumber(123);
    performance.mark('wasm-constructor-end');
    performance.measure(
      'wasm-constructor',
      'wasm-constructor-start',
      'wasm-constructor-end'
    );

    performance.mark('wasm-nextbool-start');
    const [wasmBool, wasmSeed1] = wasmSeed.nextBool();
    performance.mark('wasm-nextbool-end');
    performance.measure(
      'wasm-nextbool',
      'wasm-nextbool-start',
      'wasm-nextbool-end'
    );

    performance.mark('wasm-split-start');
    const [wasmLeft, wasmRight] = wasmSeed1.split();
    performance.mark('wasm-split-end');
    performance.measure('wasm-split', 'wasm-split-start', 'wasm-split-end');

    performance.mark('wasm-workflow-end');
    performance.measure(
      'wasm-workflow',
      'wasm-workflow-start',
      'wasm-workflow-end'
    );

    // Print all measurements
    const entries = performance
      .getEntries()
      .filter((entry) => entry.entryType === 'measure');
    entries.forEach((entry) => {
      console.log(`${entry.name}: ${entry.duration.toFixed(3)}ms`);
    });

    console.log('\nTo analyze in Chrome DevTools:');
    console.log('1. Open Chrome DevTools');
    console.log('2. Go to Performance tab');
    console.log('3. Click "Load profile"');
    console.log(
      '4. The performance timeline data is available via performance.getEntries()'
    );
  });
});
