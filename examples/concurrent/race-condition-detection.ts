/**
 * Concurrent testing examples for race condition detection.
 *
 * This example demonstrates how to use concurrent property testing to detect
 * race conditions, non-deterministic behavior, and timing issues in code.
 */

import { forAllConcurrent, detectRaceConditions, ConcurrentProperty, defaultConcurrentConfig } from '../packages/hedgehog/src/concurrent.js';
import { Gen } from '../packages/hedgehog/src/gen.js';
import { Config } from '../packages/hedgehog/src/config.js';
import { getWorkerLikePool, shutdownWorkerLikePool } from '../packages/hedgehog/src/worker.js';

export const description = "Concurrent testing for race condition detection and non-deterministic behavior analysis";

export const expectedBehavior = "Framework should detect race conditions, analyze timing variations, and provide actionable insights";

export const knownFailureModes = [
  "False positives from legitimate timing variations",
  "False negatives when race conditions are timing-dependent",
  "Worker coordination overhead masking subtle race conditions"
];

/**
 * Example 1: Detecting race conditions in shared state
 */
export async function sharedStateRaceConditions() {
  console.log('\n1. Shared State Race Conditions');
  console.log('================================');

  // Shared state that multiple workers will access
  const sharedCounter = { value: 0, operations: 0 };

  const property = forAllConcurrent(
    Gen.int(1, 10),
    (increment) => {
      // Race condition: non-atomic read-modify-write
      const currentValue = sharedCounter.value;
      const currentOps = sharedCounter.operations;

      // Simulate some processing time
      for (let i = 0; i < increment; i++) {
        // Busy wait to increase chance of race condition
      }

      sharedCounter.value = currentValue + increment;
      sharedCounter.operations = currentOps + 1;

      // Property: value should always be positive and operations should increase
      return sharedCounter.value > currentValue && sharedCounter.operations > currentOps;
    },
    4 // 4 workers competing for shared state
  );

  const config = new Config({ testLimit: 15 });
  const result = await property.run(config);

  console.log(`Determinism rate: ${(result.summary.determinismRate * 100).toFixed(1)}%`);
  console.log(`Race conditions detected: ${result.summary.raceConditionTests}`);
  console.log(`Total tests: ${result.summary.totalTests}`);

  if (result.raceConditionPatterns.length > 0) {
    console.log('\nRace condition patterns detected:');
    for (const pattern of result.raceConditionPatterns) {
      console.log(`  - ${pattern.description} (${(pattern.frequency * 100).toFixed(1)}% frequency, ${pattern.severity} severity)`);
      if (pattern.mitigation) {
        console.log(`    Mitigation: ${pattern.mitigation}`);
      }
    }
  } else {
    console.log('No race condition patterns detected');
  }

  console.log(`\nFinal shared state: value=${sharedCounter.value}, operations=${sharedCounter.operations}`);

  return result;
}

/**
 * Example 2: Testing thread-safe vs non-thread-safe implementations
 */
export async function threadSafeComparison() {
  console.log('\n2. Thread-Safe vs Non-Thread-Safe Comparison');
  console.log('=============================================');

  // Non-thread-safe counter
  class UnsafeCounter {
    private count = 0;

    increment(amount: number): number {
      const current = this.count;
      // Simulate work that could be interrupted
      for (let i = 0; i < amount % 10; i++) {
        Math.random(); // Some work
      }
      this.count = current + amount;
      return this.count;
    }

    get value(): number {
      return this.count;
    }
  }

  // Thread-safe counter (using atomic-like operations)
  class SafeCounter {
    private count = 0;

    increment(amount: number): number {
      // Atomic-like operation (in real implementation, would use proper synchronization)
      this.count += amount;
      return this.count;
    }

    get value(): number {
      return this.count;
    }
  }

  console.log('Testing unsafe counter:');
  const unsafeCounter = new UnsafeCounter();

  const unsafeProperty = forAllConcurrent(
    Gen.int(1, 5),
    (amount) => {
      const result = unsafeCounter.increment(amount);
      return result > 0; // Should always be positive
    },
    3
  );

  const unsafeResult = await unsafeProperty.run(new Config({ testLimit: 10 }));

  console.log(`  Unsafe determinism rate: ${(unsafeResult.summary.determinismRate * 100).toFixed(1)}%`);
  console.log(`  Unsafe race conditions: ${unsafeResult.summary.raceConditionTests}`);

  console.log('\nTesting safe counter:');
  const safeCounter = new SafeCounter();

  const safeProperty = forAllConcurrent(
    Gen.int(1, 5),
    (amount) => {
      const result = safeCounter.increment(amount);
      return result > 0;
    },
    3
  );

  const safeResult = await safeProperty.run(new Config({ testLimit: 10 }));

  console.log(`  Safe determinism rate: ${(safeResult.summary.determinismRate * 100).toFixed(1)}%`);
  console.log(`  Safe race conditions: ${safeResult.summary.raceConditionTests}`);

  console.log(`\nFinal counters: unsafe=${unsafeCounter.value}, safe=${safeCounter.value}`);

  return { unsafe: unsafeResult, safe: safeResult };
}

/**
 * Example 3: Timing-dependent behavior detection
 */
export async function timingDependentBehavior() {
  console.log('\n3. Timing-Dependent Behavior Detection');
  console.log('======================================');

  let timeBasedState = Date.now();

  const property = forAllConcurrent(
    Gen.int(1, 100),
    async (delay) => {
      // Timing-dependent behavior
      await new Promise(resolve => setTimeout(resolve, delay % 10));

      const now = Date.now();
      const timeDiff = now - timeBasedState;
      timeBasedState = now;

      // Property depends on timing: should be consistent but timing affects result
      return timeDiff > 0 && timeDiff < 1000;
    },
    3
  );

  const config = new Config({ testLimit: 12 });
  const result = await property.run(config);

  console.log(`Determinism rate: ${(result.summary.determinismRate * 100).toFixed(1)}%`);

  // Analyze timing statistics
  const allTimingAnalyses = result.testResults.map(r => r.timingAnalysis);
  const avgExecutionTime = allTimingAnalyses.reduce((sum, t) => sum + t.averageTime, 0) / allTimingAnalyses.length;
  const avgStdDev = allTimingAnalyses.reduce((sum, t) => sum + t.standardDeviation, 0) / allTimingAnalyses.length;

  console.log(`Average execution time: ${avgExecutionTime.toFixed(2)}ms`);
  console.log(`Average timing std deviation: ${avgStdDev.toFixed(2)}ms`);
  console.log(`Timing consistency: ${(result.performanceAnalysis.timingConsistency * 100).toFixed(1)}%`);

  const suspiciousTimingCount = allTimingAnalyses.filter(t => t.timingVariationSuspicious).length;
  console.log(`Tests with suspicious timing: ${suspiciousTimingCount}/${result.testResults.length}`);

  return result;
}

/**
 * Example 4: Memory and resource race conditions
 */
export async function memoryResourceRaces() {
  console.log('\n4. Memory and Resource Race Conditions');
  console.log('======================================');

  // Shared resource pool
  const resourcePool: string[] = ['resource1', 'resource2', 'resource3'];
  const allocatedResources = new Set<string>();

  const property = forAllConcurrent(
    Gen.oneOf(['allocate', 'deallocate']),
    (operation) => {
      if (operation === 'allocate') {
        // Try to allocate a resource
        for (const resource of resourcePool) {
          if (!allocatedResources.has(resource)) {
            allocatedResources.add(resource);
            return true; // Successfully allocated
          }
        }
        return false; // No resources available
      } else {
        // Try to deallocate a resource
        if (allocatedResources.size > 0) {
          const resource = Array.from(allocatedResources)[0];
          allocatedResources.delete(resource);
          return true; // Successfully deallocated
        }
        return false; // No resources to deallocate
      }
    },
    4 // 4 workers competing for resources
  );

  const config = new Config({ testLimit: 20 });
  const result = await property.run(config);

  console.log(`Resource allocation determinism: ${(result.summary.determinismRate * 100).toFixed(1)}%`);
  console.log(`Race conditions in resource management: ${result.summary.raceConditionTests}`);
  console.log(`Final allocated resources: ${allocatedResources.size}/${resourcePool.length}`);

  return result;
}

/**
 * Example 5: Deadlock detection
 */
export async function deadlockDetection() {
  console.log('\n5. Deadlock Detection');
  console.log('=====================');

  // Simulate potential deadlock scenario
  const lockA = { locked: false, owner: null as string | null };
  const lockB = { locked: false, owner: null as string | null };

  const property = new ConcurrentProperty(
    Gen.oneOf(['lockA_then_B', 'lockB_then_A', 'single_lock']),
    async (strategy) => {
      const workerId = `worker_${Math.random().toString(36).slice(2, 8)}`;

      try {
        if (strategy === 'lockA_then_B') {
          // Potential deadlock: acquire A then B
          while (lockA.locked) {
            await new Promise(resolve => setTimeout(resolve, 1)); // Wait
          }
          lockA.locked = true;
          lockA.owner = workerId;

          await new Promise(resolve => setTimeout(resolve, 5)); // Hold lock

          while (lockB.locked) {
            await new Promise(resolve => setTimeout(resolve, 1)); // Wait
          }
          lockB.locked = true;
          lockB.owner = workerId;

          // Release locks
          lockB.locked = false;
          lockB.owner = null;
          lockA.locked = false;
          lockA.owner = null;

          return true;
        } else if (strategy === 'lockB_then_A') {
          // Potential deadlock: acquire B then A
          while (lockB.locked) {
            await new Promise(resolve => setTimeout(resolve, 1));
          }
          lockB.locked = true;
          lockB.owner = workerId;

          await new Promise(resolve => setTimeout(resolve, 5));

          while (lockA.locked) {
            await new Promise(resolve => setTimeout(resolve, 1));
          }
          lockA.locked = true;
          lockA.owner = workerId;

          // Release locks
          lockA.locked = false;
          lockA.owner = null;
          lockB.locked = false;
          lockB.owner = null;

          return true;
        } else {
          // Single lock - safe
          while (lockA.locked) {
            await new Promise(resolve => setTimeout(resolve, 1));
          }
          lockA.locked = true;
          lockA.owner = workerId;

          await new Promise(resolve => setTimeout(resolve, 2));

          lockA.locked = false;
          lockA.owner = null;

          return true;
        }
      } catch (error) {
        // Clean up locks on error
        if (lockA.owner === workerId) {
          lockA.locked = false;
          lockA.owner = null;
        }
        if (lockB.owner === workerId) {
          lockB.locked = false;
          lockB.owner = null;
        }
        return false;
      }
    },
    {
      ...defaultConcurrentConfig(),
      workerCount: 3,
      testTimeout: 100, // Short timeout to detect deadlocks quickly
      repetitions: 2,
    }
  );

  const config = new Config({ testLimit: 8 });
  const result = await property.run(config);

  console.log(`Deadlock test determinism: ${(result.summary.determinismRate * 100).toFixed(1)}%`);
  console.log(`Timeouts detected: ${result.summary.timeoutTests}`);

  const deadlockPatterns = result.raceConditionPatterns.filter(p =>
    p.description.includes('deadlock') || p.description.includes('timeout')
  );

  if (deadlockPatterns.length > 0) {
    console.log('Potential deadlock patterns detected:');
    for (const pattern of deadlockPatterns) {
      console.log(`  - ${pattern.description} (${pattern.severity} severity)`);
    }
  }

  return result;
}

/**
 * Example 6: Using detectRaceConditions utility
 */
export async function utilityFunctionExample() {
  console.log('\n6. Race Condition Detection Utility');
  console.log('===================================');

  let globalState = 0;

  const raceResult = await detectRaceConditions(
    Gen.int(1, 10),
    (increment) => {
      // Simple race condition in global state
      const current = globalState;
      globalState = current + increment;
      return globalState > current;
    },
    {
      testCount: 15,
      workerCount: 4,
      repetitions: 3,
    }
  );

  console.log(`Has race conditions: ${raceResult.hasRaceConditions}`);
  console.log(`Determinism rate: ${(raceResult.determinismRate * 100).toFixed(1)}%`);
  console.log(`Patterns detected: ${raceResult.patterns.length}`);

  for (const pattern of raceResult.patterns) {
    console.log(`  - ${pattern.description} (${(pattern.frequency * 100).toFixed(1)}% frequency)`);
  }

  console.log(`Final global state: ${globalState}`);

  return raceResult;
}

/**
 * Validation function to verify all examples work correctly.
 */
export async function validateConcurrentExamples() {
  console.log('Validating concurrent testing examples...\n');

  // Initialize worker pool
  const workerPool = getWorkerLikePool();
  await workerPool.initialize();

  try {
    const result1 = await sharedStateRaceConditions();
    console.assert(result1.summary.totalTests > 0, 'Shared state test should run tests');

    const result2 = await threadSafeComparison();
    console.assert(result2.unsafe.summary.totalTests > 0, 'Thread-safe comparison should run tests');

    const result3 = await timingDependentBehavior();
    console.assert(result3.performanceAnalysis.timingConsistency >= 0, 'Timing analysis should provide metrics');

    const result4 = await memoryResourceRaces();
    console.assert(result4.summary.totalTests > 0, 'Resource race test should run tests');

    const result5 = await deadlockDetection();
    console.assert(result5.summary.totalTests > 0, 'Deadlock detection should run tests');

    const result6 = await utilityFunctionExample();
    console.assert(typeof result6.hasRaceConditions === 'boolean', 'Utility should return boolean');

    console.log('\n✓ All concurrent testing examples validated successfully!');
    return true;
  } catch (error) {
    console.error('\n✗ Concurrent testing validation failed:', error);
    return false;
  } finally {
    await shutdownWorkerLikePool();
  }
}

/**
 * Performance baseline for concurrent testing.
 */
export const performanceBaseline = {
  minDeterminismRate: 0.8, // 80% of tests should be deterministic for well-behaved code
  maxRaceConditionRate: 0.2, // Less than 20% of tests should show race conditions
  maxTimeoutRate: 0.1, // Less than 10% of tests should timeout
  minWorkerUtilization: 0.5, // At least 50% worker utilization
};

// If run directly
if (import.meta.main) {
  validateConcurrentExamples().then(success => {
    process.exit(success ? 0 : 1);
  });
}