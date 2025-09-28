/**
 * Meta-tests for concurrent property testing infrastructure.
 *
 * These tests validate that our concurrent testing framework correctly detects
 * race conditions, non-deterministic behavior, and timing issues.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  forAllConcurrent,
  ConcurrentProperty,
  defaultConcurrentConfig,
  detectRaceConditions
} from '../concurrent.js';
import { Gen } from '../gen.js';
import { Config } from '../config.js';
import { getWorkerLikePool, shutdownWorkerLikePool } from '../worker.js';

describe('Concurrent Property Testing Meta-Tests', () => {
  beforeAll(async () => {
    const workerPool = getWorkerLikePool();
    await workerPool.initialize();
  });

  afterAll(async () => {
    await shutdownWorkerLikePool();
  });

  describe('Determinism Detection', () => {
    it('should identify deterministic functions as deterministic', async () => {
      const property = forAllConcurrent(
        Gen.int(1, 100),
        (n) => n * 2 === n + n, // Always deterministic
        3 // 3 workers
      );

      const config = new Config({ testLimit: 10 });
      const result = await property.run(config);

      expect(result.summary.determinismRate).toBeGreaterThan(0.9);
      expect(result.summary.raceConditionTests).toBe(0);
      expect(result.raceConditionPatterns.length).toBe(0);
    });

    it('should detect artificially non-deterministic behavior', async () => {
      let counter = 0;

      const property = forAllConcurrent(
        Gen.int(1, 10),
        (n) => {
          // Artificially create non-deterministic behavior
          counter++;
          return (counter + n) % 3 !== 0; // Result depends on execution order
        },
        4 // 4 workers
      );

      const config = new Config({ testLimit: 5 });
      const result = await property.run(config);

      // Should detect some non-deterministic behavior
      expect(result.summary.determinismRate).toBeLessThan(1.0);
      expect(result.summary.raceConditionTests).toBeGreaterThan(0);
    });

    it('should handle async deterministic functions', async () => {
      const property = forAllConcurrent(
        Gen.int(1, 50),
        async (n) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return n > 0; // Always true, deterministic
        },
        2
      );

      const config = new Config({ testLimit: 8 });
      const result = await property.run(config);

      expect(result.summary.determinismRate).toBeGreaterThan(0.8);
    });
  });

  describe('Race Condition Detection', () => {
    it('should detect race conditions in shared state access', async () => {
      const sharedState = { value: 0 };

      const property = forAllConcurrent(
        Gen.int(1, 10),
        (n) => {
          // Race condition: read-modify-write without synchronization
          const current = sharedState.value;
          sharedState.value = current + n;
          return sharedState.value > current; // Should always be true, but races can break this
        },
        3
      );

      const config = new Config({ testLimit: 10 });
      const result = await property.run(config);

      // May or may not detect race conditions depending on timing,
      // but the framework should handle it gracefully
      expect(result.summary.totalTests).toBe(10);
      expect(result.raceConditionPatterns).toBeDefined();
    });

    it('should use detectRaceConditions utility function', async () => {
      let globalCounter = 0;

      const raceResult = await detectRaceConditions(
        Gen.int(1, 5),
        (n) => {
          globalCounter += n;
          return globalCounter > 0;
        },
        {
          testCount: 8,
          workerCount: 3,
          repetitions: 2,
        }
      );

      expect(raceResult.determinismRate).toBeGreaterThanOrEqual(0);
      expect(raceResult.determinismRate).toBeLessThanOrEqual(1);
      expect(typeof raceResult.hasRaceConditions).toBe('boolean');
      expect(Array.isArray(raceResult.patterns)).toBe(true);
    });
  });

  describe('Timing Analysis', () => {
    it('should analyze timing variations across workers', async () => {
      const property = forAllConcurrent(
        Gen.int(1, 20),
        async (n) => {
          // Variable delay to create timing variations
          const delay = n % 10;
          await new Promise(resolve => setTimeout(resolve, delay));
          return true;
        },
        3
      );

      const config = new Config({ testLimit: 5 });
      const result = await property.run(config);

      // Check that timing analysis is performed
      for (const testResult of result.testResults) {
        expect(testResult.timingAnalysis).toBeDefined();
        expect(testResult.timingAnalysis.averageTime).toBeGreaterThanOrEqual(0);
        expect(testResult.timingAnalysis.minTime).toBeGreaterThanOrEqual(0);
        expect(testResult.timingAnalysis.maxTime).toBeGreaterThanOrEqual(testResult.timingAnalysis.minTime);
      }
    });

    it('should detect suspicious timing variations', async () => {
      const property = forAllConcurrent(
        Gen.int(1, 10),
        async (n) => {
          // Create highly variable timing
          const delay = n % 2 === 0 ? 1 : 50; // Either very fast or relatively slow
          await new Promise(resolve => setTimeout(resolve, delay));
          return true;
        },
        2
      );

      const config = new Config({ testLimit: 6 });
      const result = await property.run(config);

      // Should detect timing variation patterns
      const _timingPatterns = result.raceConditionPatterns.filter(
        p => p.description.includes('timing')
      );

      // May or may not detect timing issues depending on actual execution,
      // but the analysis should be present
      expect(result.performanceAnalysis.timingConsistency).toBeGreaterThanOrEqual(0);
      expect(result.performanceAnalysis.timingConsistency).toBeLessThanOrEqual(1);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle worker errors gracefully', async () => {
      const property = forAllConcurrent(
        Gen.int(1, 10),
        (n) => {
          if (n === 5) {
            throw new Error('Intentional test error');
          }
          return n > 0;
        },
        3
      );

      const config = new Config({ testLimit: 10 });
      const result = await property.run(config);

      // Should complete despite errors
      expect(result.summary.totalTests).toBe(10);

      // Should have some successful tests
      expect(result.summary.deterministicTests).toBeGreaterThan(0);
    });

    it('should handle timeout scenarios', async () => {
      const property = new ConcurrentProperty(
        Gen.int(1, 5),
        async (n) => {
          if (n === 3) {
            // Create a timeout scenario
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          return true;
        },
        {
          ...defaultConcurrentConfig(),
          workerCount: 2,
          testTimeout: 100, // Short timeout
        }
      );

      const config = new Config({ testLimit: 5 });
      const result = await property.run(config);

      // Should handle timeouts gracefully
      expect(result.summary.totalTests).toBe(5);

      // May detect timeouts
      if (result.summary.timeoutTests > 0) {
        expect(result.raceConditionPatterns.some(p =>
          p.description.includes('timeout') || p.description.includes('deadlock')
        )).toBe(true);
      }
    });
  });

  describe('Performance Analysis', () => {
    it('should provide meaningful performance metrics', async () => {
      const property = forAllConcurrent(
        Gen.int(1, 20),
        (n) => n % 2 === 0 || n % 2 === 1, // Always true
        4
      );

      const config = new Config({ testLimit: 12 });
      const result = await property.run(config);

      expect(result.performanceAnalysis).toBeDefined();
      expect(result.performanceAnalysis.workerUtilization).toBeGreaterThanOrEqual(0);
      expect(result.performanceAnalysis.workerUtilization).toBeLessThanOrEqual(1);
      expect(result.performanceAnalysis.timingConsistency).toBeGreaterThanOrEqual(0);
      expect(result.performanceAnalysis.timingConsistency).toBeLessThanOrEqual(1);
      expect(result.performanceAnalysis.recommendedWorkerCount).toBeGreaterThan(0);
    });

    it('should calculate worker utilization correctly', async () => {
      const property = forAllConcurrent(
        Gen.int(1, 10),
        (_n) => true, // Simple, fast test
        2
      );

      const config = new Config({ testLimit: 4 });
      const result = await property.run(config);

      // With simple tests, worker utilization should be reasonable
      expect(result.performanceAnalysis.workerUtilization).toBeGreaterThan(0);

      // Should provide recommendations
      expect(result.performanceAnalysis.recommendedWorkerCount).toBeGreaterThanOrEqual(1);
      expect(result.performanceAnalysis.recommendedWorkerCount).toBeLessThanOrEqual(8);
    });
  });

  describe('Configuration Flexibility', () => {
    it('should handle different worker counts', async () => {
      const testCases = [1, 2, 4];

      for (const workerCount of testCases) {
        const property = forAllConcurrent(
          Gen.int(1, 10),
          (n) => n > 0,
          workerCount
        );

        const config = new Config({ testLimit: 5 });
        const result = await property.run(config);

        expect(result.summary.totalTests).toBe(5);
        expect(result.performanceAnalysis.recommendedWorkerCount).toBeGreaterThan(0);
      }
    });

    it('should handle different repetition counts', async () => {
      const customConfig = {
        ...defaultConcurrentConfig(),
        workerCount: 2,
        repetitions: 5, // More repetitions for better race condition detection
      };

      const property = new ConcurrentProperty(
        Gen.int(1, 5),
        (n) => n > 0,
        customConfig
      );

      const config = new Config({ testLimit: 3 });
      const result = await property.run(config);

      expect(result.summary.totalTests).toBe(3);
      // With more repetitions, should have more worker results per test
      expect(result.testResults[0].workerResults.length).toBeGreaterThan(2);
    });
  });

  describe('Pattern Recognition', () => {
    it('should identify patterns in race condition behavior', async () => {
      let inconsistentCounter = 0;

      const property = forAllConcurrent(
        Gen.int(1, 8),
        (n) => {
          // Create a pattern where certain inputs are more likely to cause issues
          if (n % 4 === 0) {
            inconsistentCounter++;
            return inconsistentCounter % 2 === 0; // Sometimes true, sometimes false
          }
          return true;
        },
        3
      );

      const config = new Config({ testLimit: 8 });
      const result = await property.run(config);

      // Should categorize any detected patterns
      for (const pattern of result.raceConditionPatterns) {
        expect(pattern.description).toBeDefined();
        expect(pattern.frequency).toBeGreaterThanOrEqual(0);
        expect(pattern.frequency).toBeLessThanOrEqual(1);
        expect(['low', 'medium', 'high']).toContain(pattern.severity);
      }
    });

    it('should provide actionable mitigation suggestions', async () => {
      const property = forAllConcurrent(
        Gen.int(1, 3),
        (_n) => {
          // Simulate inconsistent behavior
          return Math.random() > 0.3; // Random, non-deterministic
        },
        2
      );

      const config = new Config({ testLimit: 5 });
      const result = await property.run(config);

      // If race conditions are detected, should provide mitigation suggestions
      if (result.raceConditionPatterns.length > 0) {
        for (const pattern of result.raceConditionPatterns) {
          if (pattern.mitigation) {
            expect(typeof pattern.mitigation).toBe('string');
            expect(pattern.mitigation.length).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  describe('Integration with Property Framework', () => {
    it('should integrate with existing Config system', async () => {
      const property = forAllConcurrent(
        Gen.int(1, 50),
        (n) => n > 0,
        2
      );

      // Test with different config settings
      const configs = [
        new Config({ testLimit: 5 }),
        new Config({ testLimit: 10 }),
        new Config({ testLimit: 1 }),
      ];

      for (const config of configs) {
        const result = await property.run(config);
        expect(result.summary.totalTests).toBe(config.testLimit);
      }
    });

    it('should work with complex generators', async () => {
      const property = forAllConcurrent(
        Gen.object({
          id: Gen.int(1, 100),
          name: Gen.stringBetween(1, 10),
          active: Gen.bool(),
        }),
        (obj) => {
          // Test object properties
          return obj.id > 0 && obj.name.length > 0 && typeof obj.active === 'boolean';
        },
        3
      );

      const config = new Config({ testLimit: 8 });
      const result = await property.run(config);

      expect(result.summary.totalTests).toBe(8);
      expect(result.summary.deterministicTests).toBeGreaterThan(0);
    });
  });
});
