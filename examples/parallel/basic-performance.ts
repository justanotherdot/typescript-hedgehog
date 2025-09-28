/**
 * Basic parallel performance testing example.
 *
 * This example demonstrates how to use parallel property testing to improve
 * test execution performance by distributing tests across multiple workers.
 */

import { forAllParallel } from '../packages/hedgehog/src/parallel.js';
import { Gen } from '../packages/hedgehog/src/gen.js';
import { Config } from '../packages/hedgehog/src/config.js';

export const description = "Basic parallel execution for performance improvement";

export const expectedBehavior = "Tests should execute faster with multiple workers while maintaining correctness";

export const knownFailureModes = [
  "Worker coordination overhead may reduce efficiency for very simple tests",
  "Function serialization limitations with closures",
  "Load balancing inefficiency with uneven workloads"
];

/**
 * Example 1: Simple CPU-bound computation test
 */
export async function simpleCpuBoundTest() {
  console.log('\n1. Simple CPU-bound computation test');
  console.log('====================================');

  // Test a simple mathematical property in parallel
  const property = forAllParallel(
    Gen.int(1, 1000),
    (n) => {
      // Simple computation to test
      const square = n * n;
      return square >= n; // Always true for positive numbers
    },
    4 // Use 4 workers
  );

  const config = new Config({ testLimit: 100 });

  console.log('Running 100 tests across 4 workers...');
  const startTime = performance.now();

  const result = await property.run(config);

  const duration = performance.now() - startTime;

  console.log(`Result: ${result.outcome.type}`);
  console.log(`Duration: ${duration.toFixed(2)}ms`);
  console.log(`Tests run: ${result.outcome.testsRun}`);
  console.log(`Workers used: ${result.workerResults.length}`);
  console.log(`Speedup factor: ${result.performance.speedupFactor.toFixed(2)}x`);
  console.log(`Worker efficiency: ${(result.performance.workerEfficiency * 100).toFixed(1)}%`);
  console.log(`Tests per second: ${result.performance.testsPerSecond.toFixed(1)}`);

  if (result.issues.workerFailures.length > 0) {
    console.log(`Worker failures: ${result.issues.workerFailures.join(', ')}`);
  }

  return result;
}

/**
 * Example 2: I/O simulation test
 */
export async function ioSimulationTest() {
  console.log('\n2. I/O simulation test');
  console.log('======================');

  const property = forAllParallel(
    Gen.int(1, 100),
    async (n) => {
      // Simulate I/O delay
      await new Promise(resolve => setTimeout(resolve, Math.max(1, n % 10)));

      // Test some property after "I/O"
      return n > 0;
    },
    3 // Use 3 workers
  );

  const config = new Config({ testLimit: 50 });

  console.log('Running 50 I/O tests across 3 workers...');
  const startTime = performance.now();

  const result = await property.run(config);

  const duration = performance.now() - startTime;

  console.log(`Result: ${result.outcome.type}`);
  console.log(`Duration: ${duration.toFixed(2)}ms`);
  console.log(`Speedup factor: ${result.performance.speedupFactor.toFixed(2)}x`);
  console.log(`Worker efficiency: ${(result.performance.workerEfficiency * 100).toFixed(1)}%`);

  // Analyze worker performance
  console.log('\nWorker performance breakdown:');
  for (const workerResult of result.workerResults) {
    console.log(`  ${workerResult.workerId}: ${workerResult.timing.testsExecuted} tests, ` +
                `${workerResult.timing.averageTimePerTest.toFixed(2)}ms avg, ` +
                `${workerResult.timing.idleTime.toFixed(2)}ms idle`);
  }

  return result;
}

/**
 * Example 3: Memory allocation test
 */
export async function memoryAllocationTest() {
  console.log('\n3. Memory allocation test');
  console.log('=========================');

  const property = forAllParallel(
    Gen.int(100, 10000),
    (size) => {
      // Allocate and use memory to test resource handling
      const data: number[] = [];
      for (let i = 0; i < size; i++) {
        data.push(i * 2);
      }

      const sum = data.reduce((acc, val) => acc + val, 0);

      // Property: sum should be correct for arithmetic sequence
      const expectedSum = (size - 1) * size; // Sum of 0*2 + 1*2 + ... + (size-1)*2
      return sum === expectedSum;
    },
    2 // Use 2 workers for memory test
  );

  const config = new Config({ testLimit: 30 });

  console.log('Running 30 memory allocation tests across 2 workers...');
  const result = await property.run(config);

  console.log(`Result: ${result.outcome.type}`);
  console.log(`Tests run: ${result.outcome.testsRun}`);

  if (result.issues.resourceWarnings.length > 0) {
    console.log('Resource warnings:');
    for (const warning of result.issues.resourceWarnings) {
      console.log(`  - ${warning}`);
    }
  }

  return result;
}

/**
 * Example 4: Performance comparison (sequential vs parallel)
 */
export async function performanceComparison() {
  console.log('\n4. Performance comparison');
  console.log('=========================');

  const testFunction = (n: number) => {
    // CPU-intensive computation
    let result = n;
    for (let i = 0; i < n % 100; i++) {
      result = (result * 17 + 13) % 1000000;
    }
    return result >= 0;
  };

  const testCount = 200;
  const config = new Config({ testLimit: testCount });

  // Parallel execution
  console.log(`Running ${testCount} tests in parallel (4 workers)...`);
  const parallelProperty = forAllParallel(Gen.int(1, 100), testFunction, 4);

  const parallelStart = performance.now();
  const parallelResult = await parallelProperty.run(config);
  const parallelTime = performance.now() - parallelStart;

  // Sequential-like execution (1 worker)
  console.log(`Running ${testCount} tests sequentially (1 worker)...`);
  const sequentialProperty = forAllParallel(Gen.int(1, 100), testFunction, 1);

  const sequentialStart = performance.now();
  const sequentialResult = await sequentialProperty.run(config);
  const sequentialTime = performance.now() - sequentialStart;

  console.log('\nResults:');
  console.log(`Sequential time: ${sequentialTime.toFixed(2)}ms`);
  console.log(`Parallel time: ${parallelTime.toFixed(2)}ms`);

  const actualSpeedup = sequentialTime / parallelTime;
  console.log(`Actual speedup: ${actualSpeedup.toFixed(2)}x`);
  console.log(`Reported speedup: ${parallelResult.performance.speedupFactor.toFixed(2)}x`);

  if (actualSpeedup > 1.5) {
    console.log('✓ Significant performance improvement achieved!');
  } else {
    console.log('ℹ Limited speedup (overhead may be affecting performance)');
  }

  return {
    parallel: parallelResult,
    sequential: sequentialResult,
    actualSpeedup,
  };
}

/**
 * Validation function to verify the examples work correctly.
 */
export async function validateExamples() {
  console.log('Validating parallel performance examples...\n');

  try {
    const result1 = await simpleCpuBoundTest();
    console.assert(result1.outcome.type === 'pass', 'Simple CPU-bound test should pass');

    const result2 = await ioSimulationTest();
    console.assert(result2.outcome.type === 'pass', 'I/O simulation test should pass');

    const result3 = await memoryAllocationTest();
    console.assert(result3.outcome.type === 'pass', 'Memory allocation test should pass');

    const comparison = await performanceComparison();
    console.assert(comparison.parallel.outcome.type === 'pass', 'Parallel comparison should pass');
    console.assert(comparison.sequential.outcome.type === 'pass', 'Sequential comparison should pass');

    console.log('\n✓ All examples validated successfully!');
    return true;
  } catch (error) {
    console.error('\n✗ Example validation failed:', error);
    return false;
  }
}

/**
 * Performance baseline for this example.
 */
export const performanceBaseline = {
  minTestsPerSecond: 10,
  maxLatencyMs: 1000,
  targetSpeedup: 1.5,
  maxWorkerIdlePercentage: 30,
};

// If run directly
if (import.meta.main) {
  validateExamples().then(success => {
    process.exit(success ? 0 : 1);
  });
}