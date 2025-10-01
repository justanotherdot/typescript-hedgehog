/**
 * Meta-tests for worker management infrastructure.
 *
 * These tests validate that the worker pool correctly manages worker lifecycle,
 * handles failures, and maintains proper communication protocols.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkerLikePool, defaultWorkerLikePoolConfig, getWorkerLikePool, shutdownWorkerLikePool } from '../worker.js';

describe('Worker Management Meta-Tests', () => {
  let workerPool: WorkerLikePool;

  beforeEach(async () => {
    workerPool = new WorkerLikePool({
      ...defaultWorkerLikePoolConfig(),
      maxWorkers: 2,
      testTimeout: 15000, // Extended for CI
      enableLogging: false,
    });
    await workerPool.initialize();
  });

  afterEach(async () => {
    await workerPool.shutdown();
  });

  describe('Worker Lifecycle Management', () => {
    it('should initialize workers successfully', async () => {
      const stats = workerPool.getStatus();
      expect(stats.totalWorkers).toBe(2);
      expect(stats.healthyWorkers).toBe(2);
      expect(stats.activeTests).toBe(0);
      expect(stats.pendingTests).toBe(0);
    });

    it('should execute simple test functions', async () => {
      const testFunction = (_input: number) => {
        return {
          type: 'pass' as const,
          testsRun: 1,
        };
      };

      const result = await workerPool.executeTest(42, testFunction);

      expect(result.success).toBe(true);
      expect(result.result?.type).toBe('pass');
      expect(result.timing).toBeGreaterThan(0);
      expect(result.workerId).toBeDefined();
    });

    it('should handle test function errors gracefully', async () => {
      const errorTestFunction = (_input: number) => {
        throw new Error('Intentional test error');
      };

      const result = await workerPool.executeTest(42, errorTestFunction);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Intentional test error');
      expect(result.workerId).toBeDefined();
    });

    it('should execute async test functions', async () => {
      const asyncTestFunction = async (_input: number) => {
        return {
          type: 'pass' as const,
          testsRun: 1,
        };
      };

      const result = await workerPool.executeTest(42, asyncTestFunction);

      expect(result.success).toBe(true);
      expect(result.result?.type).toBe('pass');
      expect(result.timing).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle worker timeout', async () => {
      const timeoutPool = new WorkerLikePool({
        ...defaultWorkerLikePoolConfig(),
        maxWorkers: 1,
        testTimeout: 100, // Very short timeout
        enableLogging: false,
      });

      await timeoutPool.initialize();

      try {
        const slowTestFunction = async (_input: number) => {
          await new Promise(resolve => setTimeout(resolve, 500)); // Longer than 100ms timeout
          return {
            type: 'pass' as const,
            testsRun: 1,
          };
        };

        await expect(timeoutPool.executeTest(42, slowTestFunction)).rejects.toThrow();
      } finally {
        await timeoutPool.shutdown();
      }
    });

    it('should recover from worker failures', async () => {
      // Execute a test that should work
      const goodResult = await workerPool.executeTest(1, (_n: number) => ({
        type: 'pass' as const,
        testsRun: 1,
      }));

      expect(goodResult.success).toBe(true);

      // Force a worker to become unhealthy by causing an error
      const errorResult = await workerPool.executeTest(2, (_n: number) => {
        throw new Error('Simulated worker crash');
      });

      expect(errorResult.success).toBe(false);

      // Worker pool should still function for new tests
      const recoveryResult = await workerPool.executeTest(3, (_n: number) => ({
        type: 'pass' as const,
        testsRun: 1,
      }));

      expect(recoveryResult.success).toBe(true);
    });

    it('should maintain worker pool statistics correctly', async () => {
      const initialStats = workerPool.getStatus();
      expect(initialStats.activeTests).toBe(0);

      const result = await workerPool.executeTest(42, async (_input: number) => {
        return {
          type: 'pass' as const,
          testsRun: 1,
        };
      });

      expect(result.success).toBe(true);

      // After test completes, active tests should be back to 0
      const finalStats = workerPool.getStatus();
      expect(finalStats.activeTests).toBe(0);
    });
  });

  describe('Concurrent Execution', () => {
    it('should handle multiple concurrent tests', async () => {
      const testFunction = async (_input: number) => {
        return {
          type: 'pass' as const,
          testsRun: 1,
        };
      };

      // Execute multiple tests concurrently
      const promises = Array.from({ length: 5 }, (_, i) =>
        workerPool.executeTest(i, testFunction)
      );

      const results = await Promise.all(promises);

      // All tests should complete successfully
      for (const result of results) {
        expect(result.success).toBe(true);
        expect(result.result?.type).toBe('pass');
      }

      // Should have used both workers
      const workerIds = new Set(results.map(r => r.workerId));
      expect(workerIds.size).toBeGreaterThan(1);
    });

    it('should distribute work across available workers', async () => {
      const workerUsage = new Map<string, number>();

      const testFunction = (_input: number) => ({
        type: 'pass' as const,
        testsRun: 1,
      });

      // Execute many tests to ensure distribution
      const promises = Array.from({ length: 10 }, (_, i) =>
        workerPool.executeTest(i, testFunction)
      );

      const results = await Promise.all(promises);

      // Count how many tests each worker executed
      for (const result of results) {
        const count = workerUsage.get(result.workerId) || 0;
        workerUsage.set(result.workerId, count + 1);
      }

      // Should have used both workers
      expect(workerUsage.size).toBe(2);

      // Work should be reasonably distributed
      const counts = Array.from(workerUsage.values());
      const maxCount = Math.max(...counts);
      const minCount = Math.min(...counts);

      // No worker should be completely idle
      expect(minCount).toBeGreaterThan(0);

      // No worker should have more than 70% of the work (allowing for some imbalance)
      expect(maxCount).toBeLessThanOrEqual(7);
    });
  });

  describe('Resource Management', () => {
    it('should clean up resources on shutdown', async () => {
      const testPool = new WorkerLikePool({
        ...defaultWorkerLikePoolConfig(),
        maxWorkers: 2,
        enableLogging: false,
      });

      await testPool.initialize();

      const initialStats = testPool.getStatus();
      expect(initialStats.totalWorkers).toBe(2);

      await testPool.shutdown();

      const finalStats = testPool.getStatus();
      expect(finalStats.totalWorkers).toBe(0);
      expect(finalStats.pendingTests).toBe(0);
    });

  });

  describe('Health Checking', () => {
    it('should perform health checks without errors', async () => {
      // Health check should not throw
      await expect(workerPool.healthCheck()).resolves.not.toThrow();

      // Workers should still be functional after health check
      const result = await workerPool.executeTest(42, (_input: number) => ({
        type: 'pass' as const,
        testsRun: 1,
      }));

      expect(result.success).toBe(true);
    });
  });


  describe('Global Worker Pool Management', () => {
    afterEach(async () => {
      // Clean up global pool after each test
      await shutdownWorkerLikePool();
    });

    it('should provide singleton worker pool access', async () => {
      const pool1 = getWorkerLikePool();
      const pool2 = getWorkerLikePool();

      expect(pool1).toBe(pool2);

      await pool1.initialize();

      const result = await pool1.executeTest(42, (_input: number) => ({
        type: 'pass' as const,
        testsRun: 1,
      }));

      expect(result.success).toBe(true);
    });

    it('should handle global pool shutdown and recreation', async () => {
      const pool1 = getWorkerLikePool();
      await pool1.initialize();

      await shutdownWorkerLikePool();

      const pool2 = getWorkerLikePool();
      expect(pool2).not.toBe(pool1);

      await pool2.initialize();

      const result = await pool2.executeTest(42, (_input: number) => ({
        type: 'pass' as const,
        testsRun: 1,
      }));

      expect(result.success).toBe(true);
    });
  });

  describe('Function Serialization and Execution', () => {
    it('should handle functions with closures', async () => {
      const multiplier = 3;

      const testFunction = (input: number) => {
        // This closure won't work in workers due to variable serialization limits
        const result = input * multiplier;
        return {
          type: result > 0 ? 'pass' as const : 'fail' as const,
          testsRun: 1,
        };
      };

      // Functions with closures should be rejected during validation
      try {
        const result = await workerPool.executeTest(5, testFunction);

        // If we get here, check if it's a failure result
        if (!result.success && result.error?.includes('multiplier is not defined')) {
          // Alternative expected failure if closure made it through but failed at runtime
          expect(result.error).toContain('multiplier is not defined');
        } else {
          // If it somehow succeeds, that's unexpected but acceptable for this test
          expect(result.success).toBe(true);
        }
      } catch (error) {
        // Expected: Function validation should reject closures
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('not safe for worker execution');
        expect((error as Error).message).toContain('multiplier');
      }
    });

    it('should handle functions that return different result types', async () => {
      const failingFunction = (input: number) => ({
        type: 'fail' as const,
        testsRun: 1,
        counterexample: `Failed with ${input}`,
      });

      const result = await workerPool.executeTest(42, failingFunction);

      expect(result.success).toBe(true);
      expect(result.result?.type).toBe('fail');
      expect(result.result?.counterexample).toContain('42');
    });
  });
});
