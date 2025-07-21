import { describe, test } from 'vitest';
import * as WasmSeed from './wasm.js';

describe('Batch size optimization analysis', () => {
  test('Detailed sweet spot analysis', () => {
    console.log('\n=== Detailed Batch Size Analysis ===');

    // Test more granular sizes around the sweet spot
    const sizes = [
      50, 100, 200, 500, 750, 1000, 1250, 1500, 2000, 3000, 5000, 10000,
    ];
    const results: Array<{ size: number; time: number; speedup: number }> = [];

    for (const size of sizes) {
      // Measure individual calls baseline
      const start1 = performance.now();
      let seed = WasmSeed.Seed.fromNumber(42);
      for (let i = 0; i < size; i++) {
        const [, newSeed] = seed.nextBool();
        seed = newSeed;
      }
      const individualTime = performance.now() - start1;

      // Measure batched call
      const start2 = performance.now();
      const seedBatch = WasmSeed.Seed.fromNumber(42);
      const result = seedBatch.nextBoolsBatch(size);
      const batchTime = performance.now() - start2;

      const speedup = individualTime / batchTime;
      results.push({ size, time: batchTime, speedup });

      console.log(
        `Size ${size.toString().padStart(5)}: ${batchTime.toFixed(3)}ms → ${speedup.toFixed(2)}x speedup`
      );
    }

    // Find optimal size
    const optimal = results.reduce((best, current) =>
      current.speedup > best.speedup ? current : best
    );

    console.log(
      `\nOptimal batch size: ${optimal.size} (${optimal.speedup.toFixed(2)}x speedup)`
    );

    // Analyze why 10k drops
    const size1k = results.find((r) => r.size === 1000);
    const size10k = results.find((r) => r.size === 10000);

    if (size1k && size10k) {
      const timePerOp1k = size1k.time / 1000;
      const timePerOp10k = size10k.time / 10000;
      console.log(`\nTime per operation comparison:`);
      console.log(`1k batch: ${timePerOp1k.toFixed(6)}ms per operation`);
      console.log(`10k batch: ${timePerOp10k.toFixed(6)}ms per operation`);
      console.log(
        `10k is ${(timePerOp10k / timePerOp1k).toFixed(2)}x slower per operation`
      );
    }
  });

  test('Memory allocation analysis', () => {
    console.log('\n=== Memory Allocation Patterns ===');

    const sizes = [100, 1000, 10000, 50000];

    for (const size of sizes) {
      if (global.gc) global.gc();

      const memBefore = process.memoryUsage();

      // Generate multiple batches to see allocation patterns
      const ITERATIONS = 5;
      for (let i = 0; i < ITERATIONS; i++) {
        const seed = WasmSeed.Seed.fromNumber(42 + i);
        const result = seed.nextBoolsBatch(size);
        // Don't hold reference to result to allow GC
      }

      const memAfter = process.memoryUsage();
      const heapDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
      const perOperation = (heapDelta / (size * ITERATIONS)) * 1024 * 1024; // bytes per op

      console.log(
        `Size ${size.toString().padStart(5)}: ${heapDelta.toFixed(2)}MB total, ${perOperation.toFixed(1)} bytes/op`
      );
    }
  });

  test('Automatic batching simulation', () => {
    console.log('\n=== Automatic Batching Simulation ===');

    // Simulate a property testing scenario with mixed operation counts
    const scenarios = [
      { name: 'Single property test', operations: 1 },
      { name: 'Small generator chain', operations: 5 },
      { name: 'Complex property', operations: 20 },
      { name: 'Bulk test generation', operations: 100 },
      { name: 'Stress test scenario', operations: 1000 },
    ];

    const OPTIMAL_BATCH_SIZE = 1000;
    const BATCH_THRESHOLD = 10; // Switch to batching above this size

    for (const scenario of scenarios) {
      const ops = scenario.operations;

      // Current approach (individual calls)
      const start1 = performance.now();
      let seed = WasmSeed.Seed.fromNumber(42);
      for (let i = 0; i < ops; i++) {
        const [, newSeed] = seed.nextBool();
        seed = newSeed;
      }
      const individualTime = performance.now() - start1;

      // Smart batching approach
      let smartTime: number;

      if (ops <= BATCH_THRESHOLD) {
        // Use individual calls for small operations
        smartTime = individualTime;
      } else {
        // Use optimal batching
        const start2 = performance.now();
        const smartSeed = WasmSeed.Seed.fromNumber(42);
        const numBatches = Math.ceil(ops / OPTIMAL_BATCH_SIZE);
        let currentSeed = smartSeed;

        for (let batch = 0; batch < numBatches; batch++) {
          const batchSize = Math.min(
            OPTIMAL_BATCH_SIZE,
            ops - batch * OPTIMAL_BATCH_SIZE
          );
          const result = currentSeed.nextBoolsBatch(batchSize);
          currentSeed = result.finalSeed;
        }
        smartTime = performance.now() - start2;
      }

      const improvement = individualTime / smartTime;
      const strategy = ops <= BATCH_THRESHOLD ? 'individual' : 'batched';

      console.log(
        `${scenario.name.padEnd(25)}: ${improvement.toFixed(2)}x improvement (${strategy})`
      );
    }
  });

  test('Transparent API design proof of concept', () => {
    console.log('\n=== Transparent API Proof of Concept ===');

    // Simulate a smart seed class that automatically optimizes
    class SmartSeed {
      private wasmSeed: WasmSeed.Seed;
      private pendingOps: Array<{ type: 'bool' | 'bounded'; bound?: number }> =
        [];
      private static readonly BATCH_THRESHOLD = 10;
      private static readonly OPTIMAL_BATCH_SIZE = 1000;

      constructor(wasmSeed: WasmSeed.Seed) {
        this.wasmSeed = wasmSeed;
      }

      static fromNumber(value: number): SmartSeed {
        return new SmartSeed(WasmSeed.Seed.fromNumber(value));
      }

      // Immediate execution for single operations
      nextBool(): [boolean, SmartSeed] {
        const [value, newSeed] = this.wasmSeed.nextBool();
        return [value, new SmartSeed(newSeed)];
      }

      // Bulk optimization for multiple operations
      nextBools(count: number): { values: boolean[]; finalSeed: SmartSeed } {
        if (count <= SmartSeed.BATCH_THRESHOLD) {
          // Use individual calls for small counts
          const values: boolean[] = [];
          let currentSeed = this.wasmSeed;

          for (let i = 0; i < count; i++) {
            const [value, newSeed] = currentSeed.nextBool();
            values.push(value);
            currentSeed = newSeed;
          }

          return { values, finalSeed: new SmartSeed(currentSeed) };
        } else {
          // Use optimal batching
          const result = this.wasmSeed.nextBoolsBatch(count);
          return {
            values: result.values,
            finalSeed: new SmartSeed(result.finalSeed),
          };
        }
      }
    }

    // Test the smart approach
    const scenarios = [5, 50, 500, 5000];

    for (const count of scenarios) {
      // Regular approach
      const start1 = performance.now();
      let seed = WasmSeed.Seed.fromNumber(42);
      for (let i = 0; i < count; i++) {
        const [, newSeed] = seed.nextBool();
        seed = newSeed;
      }
      const regularTime = performance.now() - start1;

      // Smart approach
      const start2 = performance.now();
      const smartSeed = SmartSeed.fromNumber(42);
      const result = smartSeed.nextBools(count);
      const smartTime = performance.now() - start2;

      const improvement = regularTime / smartTime;
      console.log(
        `Count ${count.toString().padStart(4)}: ${improvement.toFixed(2)}x improvement with smart batching`
      );
    }
  });
});
