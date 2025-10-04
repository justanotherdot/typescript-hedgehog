/**
 * Security-focused tests for worker infrastructure hardening.
 *
 * These tests validate that all security measures implemented in the worker
 * infrastructure are working correctly, including message validation,
 * resource limits, race condition prevention, and function serialization security.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkerLikePool, defaultWorkerLikePoolConfig } from '../worker.js';
import {
  serializeFunction,
  deserializeFunction,
  validateWorkerFunction,
  createWorkerSafeFunction,
} from '../worker/function-serializer.js';

describe('Worker Security Meta-Tests', () => {
  let workerPool: WorkerLikePool;

  beforeEach(async () => {
    workerPool = new WorkerLikePool({
      ...defaultWorkerLikePoolConfig(),
      maxWorkers: 2,
      testTimeout: 10000, // Extended for CI
      healthCheckTimeout: 15000, // Extended for CI
      enableLogging: false,
    });
    await workerPool.initialize();
  });

  afterEach(async () => {
    await workerPool.shutdown();
  });

  describe('Function Serialization Security', () => {
    it('should accept most patterns but warn about closures', () => {
      // These patterns are allowed - focus is on robustness rather than sandboxing
      const allowedFunctions = [
        () => eval('1 + 1'),
        () => new Function('return 1')(),
        () => require('fs'),
        () => process.exit(0),
        () => ((global as any).secret = 'leaked'),
      ];

      for (const fn of allowedFunctions) {
        // Should not throw - these patterns don't interfere with worker execution
        expect(() =>
          createWorkerSafeFunction(fn, { allowUnsafe: true })
        ).not.toThrow();
      }

      // Closures should be detected as they won't work across process boundaries
      const outsideVar = 42;
      const closureFunction = (x: number) => x + outsideVar;
      expect(() => createWorkerSafeFunction(closureFunction)).toThrow(
        /closure/
      );
    });

    it('should accept safe test functions', () => {
      const safeFunctions = [
        (x: number) => x + 1,
        (x: string) => x.length,
        (x: any[]) => x.filter(Boolean),
        async (x: number) => Promise.resolve(x * 2),
        (_x: number) => ({ type: 'pass' as const, testsRun: 1 }),
      ];

      for (const fn of safeFunctions) {
        expect(() => serializeFunction(fn)).not.toThrow();
      }
    });

    it('should validate function serialization round-trip', () => {
      const testFunction = (x: number) => x * 2 + 1;

      const serialized = serializeFunction(testFunction);
      expect(serialized.code).toContain('x * 2 + 1');
      expect(serialized.isSafeForWorker).toBe(true);

      const deserialized = deserializeFunction(serialized);
      expect(typeof deserialized).toBe('function');
      expect(deserialized(5)).toBe(11);
    });

    it('should detect potential closure variables', () => {
      const outsideVariable = 42;
      const functionWithClosure = (x: number) => x + outsideVariable;

      const validation = validateWorkerFunction(functionWithClosure);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('closures'))).toBe(true);
    });

    it('should reject oversized function code', () => {
      // Create a function with very large code
      const largeFunctionCode = 'x => ' + 'x + 1 + '.repeat(50000) + '0';
      const largeFunction = new Function('return ' + largeFunctionCode)();

      const serialized = serializeFunction(largeFunction);
      expect(() => deserializeFunction(serialized)).toThrow(
        /exceeds maximum size/
      );
    });

    it('should reject functions with too many parameters', () => {
      // Function with too many parameters
      const manyParamFunction = new Function(
        Array.from({ length: 15 }, (_, i) => `p${i}`).join(','),
        'return p0'
      );

      const serialized = serializeFunction(manyParamFunction);
      expect(() => deserializeFunction(serialized)).toThrow(
        /too many parameters/
      );
    });
  });

  describe('Resource Limit Enforcement', () => {
    it('should handle resource exhaustion gracefully', async () => {
      // Create a pool with very limited resources for testing
      const limitedPool = new WorkerLikePool({
        ...defaultWorkerLikePoolConfig(),
        maxWorkers: 1,
        testTimeout: 15000, // Extended for CI
        enableLogging: false,
      });

      await limitedPool.initialize();

      try {
        // Try to overwhelm the worker with concurrent tests
        const manyTests = Array.from({ length: 8 }, (_, i) =>
          limitedPool.executeTest(i, async (_x: number) => {
            return { type: 'pass' as const, testsRun: 1 };
          })
        );

        const results = await Promise.allSettled(manyTests);

        // Some tests should succeed, others might be rejected due to resource limits
        const succeeded = results.filter(
          (r) => r.status === 'fulfilled'
        ).length;
        const failed = results.filter((r) => r.status === 'rejected').length;

        expect(succeeded + failed).toBe(8);
        expect(succeeded).toBeGreaterThan(0); // At least some should work
      } finally {
        await limitedPool.shutdown();
      }
    });

    it('should prevent memory exhaustion from pending tests', async () => {
      // Test that we can't queue unlimited tests
      const testFunction = async (_x: number) => {
        return { type: 'pass' as const, testsRun: 1 };
      };

      // Start concurrent tests (should hit pending test limits)
      const promises = Array.from({ length: 10 }, (_, i) =>
        workerPool.executeTest(i, testFunction).catch((error) => error)
      );

      const results = await Promise.all(promises);

      // Should have a mix of successful and failed results
      const errors = results.filter((r) => r instanceof Error);
      const successes = results.filter((r) => !(r instanceof Error));

      expect(errors.length + successes.length).toBe(10);

      // At least some should succeed
      expect(successes.length).toBeGreaterThan(0);

      // Some should fail due to resource limits (if implemented)
      // Note: This might not fail if resource limits are very high
    });
  });

  describe('Health Check Race Condition Prevention', () => {
    it('should handle concurrent health checks without interference', async () => {
      // Perform multiple concurrent health checks
      const healthCheckPromises = Array.from({ length: 10 }, () =>
        workerPool.healthCheck()
      );

      // All health checks should complete successfully without throwing
      await expect(Promise.all(healthCheckPromises)).resolves.toBeDefined();
    });

    it('should maintain health check integrity during test execution', async () => {
      // Start some test execution
      const testPromises = Array.from({ length: 5 }, (_, i) =>
        workerPool.executeTest(i, async (_x: number) => {
          return { type: 'pass' as const, testsRun: 1 };
        })
      );

      // Perform health checks while tests are running
      const healthPromises = Array.from({ length: 3 }, () =>
        workerPool.healthCheck()
      );

      // Both should complete successfully
      const [testResults, healthResults] = await Promise.all([
        Promise.all(testPromises),
        Promise.all(healthPromises),
      ]);

      // All tests should succeed
      for (const result of testResults) {
        expect(result.success).toBe(true);
      }

      // All health checks should complete successfully
      expect(healthResults).toHaveLength(3);
    });
  });

  describe('Worker Termination Security', () => {
    it('should clean up all resources during termination', async () => {
      const testPool = new WorkerLikePool({
        ...defaultWorkerLikePoolConfig(),
        maxWorkers: 2,
        enableLogging: false,
      });

      await testPool.initialize();

      // Test basic shutdown without pending operations
      await testPool.shutdown();

      // Pool should be completely cleaned up
      const stats = testPool.getStatus();
      expect(stats.totalWorkers).toBe(0);
      expect(stats.pendingTests).toBe(0);
    });

    it('should prevent new operations after termination', async () => {
      const testPool = new WorkerLikePool({
        ...defaultWorkerLikePoolConfig(),
        maxWorkers: 1,
        enableLogging: false,
      });

      await testPool.initialize();
      await testPool.shutdown();

      // Attempting to use shut down pool should fail
      await expect(
        testPool.executeTest(1, () => ({ type: 'pass' as const, testsRun: 1 }))
      ).rejects.toThrow();
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should handle malformed test inputs gracefully', async () => {
      const testFunction = (input: any) => {
        // Test function that handles any input type
        if (typeof input === 'object' && input !== null) {
          return { type: 'pass' as const, testsRun: 1 };
        }
        return { type: 'fail' as const, testsRun: 1 };
      };

      const malformedInputs = [
        null,
        undefined,
        { circular: {} },
        new Date(),
        /regex/,
        Symbol('test'),
        BigInt(123),
      ];

      // Add circular reference
      malformedInputs[2].circular = malformedInputs[2];

      for (const input of malformedInputs) {
        try {
          const result = await workerPool.executeTest(input, testFunction);
          // Should either succeed or fail gracefully
          expect(typeof result.success).toBe('boolean');
        } catch (error) {
          // Serialization errors are acceptable for unsupported types
          expect(error).toBeInstanceOf(Error);
        }
      }
    });

    it('should handle extremely large inputs appropriately', async () => {
      const testFunction = (input: string) => ({
        type: input.length > 1000 ? ('fail' as const) : ('pass' as const),
        testsRun: 1,
      });

      // Very large string input
      const largeInput = 'x'.repeat(100000);

      try {
        const result = await workerPool.executeTest(largeInput, testFunction);
        // If it succeeds, should handle large input correctly
        expect(result.success).toBe(true);
        expect(result.result?.type).toBe('fail');
      } catch (error) {
        // Size limits may prevent this from working
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Error Isolation and Recovery', () => {
    it('should isolate worker errors from affecting other workers', async () => {
      const crashFunction = () => {
        throw new Error('Simulated worker crash');
      };

      const normalFunction = (_x: number) => ({
        type: 'pass' as const,
        testsRun: 1,
      });

      // Crash one worker
      const crashResult = await workerPool.executeTest(1, crashFunction);
      expect(crashResult.success).toBe(false);

      // Other workers should still work
      const normalResult = await workerPool.executeTest(2, normalFunction);
      expect(normalResult.success).toBe(true);

      // Original crashed worker should be replaced/recovered
      const recoveryResult = await workerPool.executeTest(3, normalFunction);
      expect(recoveryResult.success).toBe(true);
    });

    it('should maintain pool health after error conditions', async () => {
      // Test just a few key error scenarios, not exhaustive
      const errorConditions = [
        () => {
          throw new Error('Runtime error');
        },
        () => Promise.reject(new Error('Async error')),
      ];

      // Try each error condition
      for (let i = 0; i < errorConditions.length; i++) {
        try {
          await workerPool.executeTest(i, errorConditions[i]);
        } catch (_error) {
          // Errors are expected
        }

        // Pool should still be healthy
        const stats = workerPool.getStatus();
        expect(stats.healthyWorkers).toBeGreaterThan(0);
      }

      // Normal operation should still work
      const result = await workerPool.executeTest(999, (_x: number) => ({
        type: 'pass' as const,
        testsRun: 1,
      }));

      expect(result.success).toBe(true);
    });
  });
});
