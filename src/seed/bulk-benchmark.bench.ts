import { describe, test } from 'vitest';
import * as WasmSeed from './wasm.js';

describe('Bulk operations performance measurement', () => {
  const BATCH_SIZES = [10, 100, 1000];
  const RUNS = 10;

  function measureOperation(
    name: string,
    operation: () => void,
    runs: number = RUNS
  ): number {
    const times: number[] = [];

    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      operation();
      const end = performance.now();
      times.push(end - start);
    }

    const avgTime = times.reduce((a, b) => a + b) / times.length;
    const stdDev = Math.sqrt(
      times.reduce((acc, time) => acc + Math.pow(time - avgTime, 2), 0) /
        times.length
    );

    console.log(`${name}:`);
    console.log(`  Average: ${avgTime.toFixed(3)}ms`);
    console.log(`  StdDev: ${stdDev.toFixed(3)}ms`);
    console.log(`  Times: [${times.map((t) => t.toFixed(2)).join(', ')}]`);

    return avgTime;
  }

  test('Individual vs Batched WASM calls', () => {
    for (const batchSize of BATCH_SIZES) {
      console.log(`\n=== Batch Size: ${batchSize} ===`);

      const individualTime = measureOperation(
        `Individual calls (${batchSize}x)`,
        () => {
          let seed = WasmSeed.Seed.fromNumber(42);
          for (let i = 0; i < batchSize; i++) {
            const [, newSeed] = seed.nextBool();
            seed = newSeed;
          }
        }
      );

      const batchTime = measureOperation(
        `Batched call (1x${batchSize})`,
        () => {
          const seed = WasmSeed.Seed.fromNumber(42);
          const result = seed.nextBoolsBatch(batchSize);
        }
      );

      const speedup = individualTime / batchTime;
      console.log(`\nSpeedup: ${speedup.toFixed(2)}x faster with batching`);
      console.log(`Per-operation cost:`);
      console.log(
        `  Individual: ${(individualTime / batchSize).toFixed(3)}ms per bool`
      );
      console.log(
        `  Batched: ${(batchTime / batchSize).toFixed(3)}ms per bool`
      );
    }
  });

  test('Memory allocation comparison', () => {
    const BATCH_SIZE = 1000;
    const ITERATIONS = 5;

    console.log(
      `\n=== Memory Usage Comparison (${BATCH_SIZE} bools, ${ITERATIONS} iterations) ===`
    );

    // Force GC if available
    if (global.gc) {
      global.gc();
    }

    const memBefore = process.memoryUsage();

    for (let iter = 0; iter < ITERATIONS; iter++) {
      let seed = WasmSeed.Seed.fromNumber(42 + iter);
      for (let i = 0; i < BATCH_SIZE; i++) {
        const [, newSeed] = seed.nextBool();
        seed = newSeed;
      }
    }

    if (global.gc) {
      global.gc();
    }

    const memMiddle = process.memoryUsage();

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const seed = WasmSeed.Seed.fromNumber(42 + iter);
      const result = seed.nextBoolsBatch(BATCH_SIZE);
    }

    if (global.gc) {
      global.gc();
    }

    const memAfter = process.memoryUsage();

    const individualMemory =
      (memMiddle.heapUsed - memBefore.heapUsed) / 1024 / 1024;
    const batchedMemory =
      (memAfter.heapUsed - memMiddle.heapUsed) / 1024 / 1024;

    console.log(
      `Individual calls heap delta: ${individualMemory.toFixed(2)}MB`
    );
    console.log(`Batched calls heap delta: ${batchedMemory.toFixed(2)}MB`);
    console.log(
      `Memory reduction: ${(individualMemory / batchedMemory).toFixed(2)}x less with batching`
    );
  });

  test('Consistency verification', () => {
    console.log(`\n=== Consistency Check ===`);

    const BATCH_SIZE = 100;
    const seed = WasmSeed.Seed.fromNumber(12345);

    // Generate using individual calls
    let individualSeed = seed;
    const individualResults: boolean[] = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const [value, newSeed] = individualSeed.nextBool();
      individualResults.push(value);
      individualSeed = newSeed;
    }

    // Generate using batch call
    const batchResult = seed.nextBoolsBatch(BATCH_SIZE);
    const batchedResults = batchResult.values;

    // Compare results
    let matches = 0;
    for (let i = 0; i < BATCH_SIZE; i++) {
      if (individualResults[i] === batchedResults[i]) {
        matches++;
      }
    }

    console.log(
      `Results match: ${matches}/${BATCH_SIZE} (${((matches / BATCH_SIZE) * 100).toFixed(1)}%)`
    );
    console.log(
      `Final seed states match: ${individualSeed.state === batchResult.finalSeed.state}`
    );

    if (matches !== BATCH_SIZE) {
      console.log(
        `First 10 individual: [${individualResults.slice(0, 10).join(', ')}]`
      );
      console.log(
        `First 10 batched:    [${batchedResults.slice(0, 10).join(', ')}]`
      );
    }
  });

  test('Scaling analysis', () => {
    console.log(`\n=== Scaling Analysis ===`);

    const sizes = [1, 10, 100, 1000, 10000];
    const results: Array<{
      size: number;
      individual: number;
      batched: number;
      speedup: number;
    }> = [];

    for (const size of sizes) {
      const individualTime = measureOperation(
        `Individual ${size}`,
        () => {
          let seed = WasmSeed.Seed.fromNumber(42);
          for (let i = 0; i < size; i++) {
            const [, newSeed] = seed.nextBool();
            seed = newSeed;
          }
        },
        3 // Fewer runs for larger sizes
      );

      const batchTime = measureOperation(
        `Batched ${size}`,
        () => {
          const seed = WasmSeed.Seed.fromNumber(42);
          const result = seed.nextBoolsBatch(size);
        },
        3
      );

      const speedup = individualTime / batchTime;
      results.push({
        size,
        individual: individualTime,
        batched: batchTime,
        speedup,
      });

      console.log(`Size ${size}: ${speedup.toFixed(2)}x speedup`);
    }

    console.log(`\n=== Scaling Summary ===`);
    console.log(`Size\tIndividual(ms)\tBatched(ms)\tSpeedup`);
    for (const result of results) {
      console.log(
        `${result.size}\t${result.individual.toFixed(3)}\t\t${result.batched.toFixed(3)}\t\t${result.speedup.toFixed(2)}x`
      );
    }
  });
});
