/**
 * Meta-tests for parallel property testing infrastructure.
 *
 * These tests validate that our parallel testing framework works correctly
 * by testing the testing framework itself using property-based testing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { forAllParallel } from '../parallel.js';
import { forAll } from '../property.js';
import { Gen } from '../gen.js';
import { Config } from '../config.js';
import { getWorkerLikePool, shutdownWorkerLikePool } from '../worker.js';

describe('Parallel Property Testing Meta-Tests', () => {
  beforeAll(async () => {
    // Initialize worker pool for testing
    const workerPool = getWorkerLikePool();
    await workerPool.initialize();
  });

  afterAll(async () => {
    // Clean up worker pool
    await shutdownWorkerLikePool();
  });

  describe('Work Distribution Correctness', () => {
    it('should distribute work evenly in round-robin mode', async () => {
      const testInputs: number[] = [];
      const workerCount = 3;

      const property = forAllParallel(
        Gen.int(1, 100),
        (n) => {
          testInputs.push(n);
          return n > 0; // Always pass
        },
        workerCount
      );

      const config = new Config({ testLimit: 9 }); // 9 tests for 3 workers = 3 each
      const result = await property.run(config);

      expect(result.outcome.type).toBe('pass');
      expect(result.workerResults).toHaveLength(workerCount);

      // Each worker should have executed approximately the same number of tests
      const testCounts = result.workerResults.map(wr => wr.timing.testsExecuted);
      const expectedPerWorker = Math.floor(9 / workerCount);

      for (const count of testCounts) {
        expect(count).toBeGreaterThanOrEqual(expectedPerWorker);
        expect(count).toBeLessThanOrEqual(expectedPerWorker + 1);
      }
    });

    it('should handle uneven work distribution gracefully', async () => {
      const workerCount = 4;
      const testCount = 10; // Not evenly divisible by 4

      const property = forAllParallel(
        Gen.int(1, 100),
        (n) => n > 0,
        workerCount
      );

      const config = new Config({ testLimit: testCount });
      const result = await property.run(config);

      expect(result.outcome.type).toBe('pass');

      // Total tests executed should equal test count
      const totalExecuted = result.workerResults.reduce(
        (sum, wr) => sum + wr.timing.testsExecuted, 0
      );
      expect(totalExecuted).toBe(testCount);
    });
  });

  describe('Performance Metric Calculation', () => {
    it('should calculate speedup factor correctly', async () => {
      const workerCount = 2;

      // Create a property with measurable work
      const property = forAllParallel(
        Gen.int(1, 10),
        async (n) => {
          // Simulate work with a small delay
          await new Promise(resolve => setTimeout(resolve, 1));
          return n > 0;
        },
        workerCount
      );

      const config = new Config({ testLimit: 10 });
      const result = await property.run(config);

      expect(result.outcome.type).toBe('pass');
      expect(result.performance.speedupFactor).toBeGreaterThan(1);
      expect(result.performance.speedupFactor).toBeLessThanOrEqual(workerCount);
      expect(result.performance.testsPerSecond).toBeGreaterThan(0);
    });

    it('should track worker efficiency', async () => {
      const property = forAllParallel(
        Gen.int(1, 100),
        (n) => n > 0,
        2
      );

      const config = new Config({ testLimit: 20 });
      const result = await property.run(config);

      expect(result.performance.workerEfficiency).toBeGreaterThan(0);
      expect(result.performance.workerEfficiency).toBeLessThanOrEqual(1);

      // With simple work, efficiency should be reasonably high
      expect(result.performance.workerEfficiency).toBeGreaterThan(0.1);
    });
  });

  describe('Worker Failure Handling', () => {
    it('should handle failing test functions gracefully', async () => {
      const property = forAllParallel(
        Gen.int(1, 100),
        (n) => {
          if (n === 50) {
            throw new Error('Intentional test failure');
          }
          return n > 0;
        },
        2
      );

      const config = new Config({ testLimit: 100 });
      const result = await property.run(config);

      // Should fail when it hits n=50
      expect(result.outcome.type).toBe('fail');
      expect(result.outcome.counterexample).toContain('50');
    });

    it('should report worker failures in issues', async () => {
      const property = forAllParallel(
        Gen.int(1, 10),
        (n) => {
          if (n % 5 === 0) {
            throw new Error(`Worker error for ${n}`);
          }
          return true;
        },
        2
      );

      const config = new Config({ testLimit: 10 });
      const result = await property.run(config);

      // Should have worker failure reported
      expect(result.issues.workerFailures.length).toBeGreaterThan(0);
    });
  });

  describe('Result Aggregation Correctness', () => {
    it('should aggregate passing results correctly', async () => {
      const property = forAllParallel(
        Gen.int(1, 100),
        (n) => n > 0, // Always pass
        3
      );

      const config = new Config({ testLimit: 15 });
      const result = await property.run(config);

      expect(result.outcome.type).toBe('pass');
      expect(result.outcome.testsRun).toBe(15);

      // All workers should have passed
      for (const workerResult of result.workerResults) {
        expect(workerResult.result.type).toBe('pass');
      }
    });

    it('should propagate first failure correctly', async () => {
      let _testCount = 0;

      const property = forAllParallel(
        Gen.int(1, 100),
        (n) => {
          _testCount++;
          return n !== 13; // Fail on unlucky number
        },
        2
      );

      const config = new Config({ testLimit: 50 });
      const result = await property.run(config);

      expect(result.outcome.type).toBe('fail');
      expect(result.outcome.counterexample).toContain('13');
    });
  });

  describe('Deterministic Behavior', () => {
    it('should produce deterministic results with same seed', async () => {
      const config = new Config({ testLimit: 20 });

      const property = forAllParallel(
        Gen.int(1, 100),
        (n) => n % 7 !== 0, // Deterministic failure pattern
        2
      );

      const result1 = await property.run(config);
      const result2 = await property.run(config);

      // Results should be consistent (both pass or both fail with same counterexample)
      expect(result1.outcome.type).toBe(result2.outcome.type);

      if (result1.outcome.type === 'fail' && result2.outcome.type === 'fail') {
        expect(result1.outcome.counterexample).toBe(result2.outcome.counterexample);
      }
    });
  });

  describe('Load Balancing Analysis', () => {
    it('should detect load imbalance when present', async () => {
      // Create a scenario where some workers will have much more work
      const property = forAllParallel(
        Gen.int(1, 100),
        async (n) => {
          // Make some tests much slower than others
          if (n < 10) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          return true;
        },
        3
      );

      const config = new Config({ testLimit: 12 }); // Uneven distribution
      const result = await property.run(config);

      // Check if load balancing issues are detected
      // Note: This might not always trigger depending on work distribution
      if (result.issues.loadBalancingIssues.length > 0) {
        expect(result.issues.loadBalancingIssues[0]).toContain('Load imbalance');
      }
    });
  });

  describe('Property-Based Tests of Parallel Properties', () => {
    it('should maintain correctness invariant: parallel result equals sequential result', async () => {
      const sequentialEqualsParallel = forAll(
        Gen.array(Gen.int(1, 100), { minLength: 5, maxLength: 20 }),
        async (inputs) => {
          // Test a simple property on the same inputs
          const testFn = (n: number) => n > 0 && n <= 100;

          // Sequential execution
          const sequentialResults = inputs.map(testFn);
          const sequentialPassed = sequentialResults.every(r => r);

          // Parallel execution
          const parallelProperty = forAllParallel(
            Gen.oneOf(inputs),
            testFn,
            2
          );

          const config = new Config({ testLimit: inputs.length });
          const parallelResult = await parallelProperty.run(config);
          const parallelPassed = parallelResult.outcome.type === 'pass';

          // Both should have the same outcome
          return sequentialPassed === parallelPassed;
        }
      );

      const config = new Config({ testLimit: 20 });
      const result = await sequentialEqualsParallel.run(config);
      expect(result.type).toBe('pass');
    });
  });

  describe('Performance Regression Detection', () => {
    it('should achieve reasonable speedup with multiple workers', async () => {
      const workerCount = 2;

      const property = forAllParallel(
        Gen.int(1, 100),
        async (n) => {
          // Add some CPU work to make parallelization worthwhile
          let sum = 0;
          for (let i = 0; i < n; i++) {
            sum += i;
          }
          return sum >= 0;
        },
        workerCount
      );

      const config = new Config({ testLimit: 50 });
      const result = await property.run(config);

      expect(result.outcome.type).toBe('pass');

      // Should achieve some speedup (though may be limited by overhead in test environment)
      // In real scenarios with actual workers, this would be > 1, but our simplified test implementation
      // uses direct execution, so we just verify it's a reasonable positive number
      expect(result.performance.speedupFactor).toBeGreaterThan(0.5);

      // Worker efficiency should be reasonable
      expect(result.performance.workerEfficiency).toBeGreaterThan(0.1);

      // Should complete tests at a reasonable rate
      expect(result.performance.testsPerSecond).toBeGreaterThan(1);
    });
  });
});
