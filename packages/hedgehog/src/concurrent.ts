/**
 * Simplified concurrent testing for basic race condition detection.
 */

import { Gen } from './gen.js';
import { Config } from './config.js';
import { Seed } from './data/seed.js';
import { Size } from './data/size.js';

/**
 * Simplified result type for concurrent testing.
 */
export interface ConcurrentTestResult {
  readonly type: 'pass' | 'fail';
  readonly testsRun: number;
  readonly propertyName?: string;
  readonly counterexample?: string;
  readonly shrinksPerformed?: number;
}

/**
 * Basic concurrent testing configuration.
 */
export interface ConcurrentConfig {
  /** Number of workers to run the same test simultaneously */
  readonly workerCount: number;
  /** Timeout for individual test execution (milliseconds) */
  readonly testTimeout: number;
  /** Number of times to repeat each test input */
  readonly repetitions: number;
}

/**
 * Default concurrent testing configuration.
 */
export function defaultConcurrentConfig(): ConcurrentConfig {
  return {
    workerCount: 4,
    testTimeout: 15000,
    repetitions: 3,
  };
}

/**
 * Results from concurrent property testing.
 */
export interface ConcurrentPropertyResult {
  /** Overall summary */
  readonly summary: {
    readonly totalTests: number;
    readonly deterministicTests: number;
    readonly raceConditionTests: number;
    readonly determinismRate: number;
  };
  /** Individual test results */
  readonly testResults: readonly {
    readonly input: unknown;
    readonly results: readonly unknown[];
    readonly consistent: boolean;
  }[];
}

/**
 * Basic concurrent property for testing race conditions.
 */
export class ConcurrentProperty<T> {
  constructor(
    private readonly generator: Gen<T>,
    private readonly property: (input: T) => unknown | Promise<unknown>,
    private readonly config: ConcurrentConfig = defaultConcurrentConfig()
  ) {}

  /**
   * Run the concurrent property test.
   */
  async run(testConfig: Config): Promise<ConcurrentPropertyResult> {
    const testResults: Array<{
      input: unknown;
      results: unknown[];
      consistent: boolean;
    }> = [];

    let deterministicTests = 0;
    let raceConditionTests = 0;

    for (let i = 0; i < testConfig.testLimit; i++) {
      const input = this.generator.generate(Size.of(i), Seed.fromNumber(i * 1000)).value;

      // Run the same test multiple times concurrently
      const promises = Array.from({ length: this.config.workerCount }, () =>
        Promise.resolve(this.property(input))
      );

      try {
        const results = await Promise.all(promises);

        // Check if all results are the same (deterministic)
        const firstResult = results[0];
        const consistent = results.every(result =>
          JSON.stringify(result) === JSON.stringify(firstResult)
        );

        testResults.push({
          input,
          results,
          consistent,
        });

        if (consistent) {
          deterministicTests++;
        } else {
          raceConditionTests++;
        }
      } catch (error) {
        // Treat errors as non-deterministic
        testResults.push({
          input,
          results: [error],
          consistent: false,
        });
        raceConditionTests++;
      }
    }

    const totalTests = testConfig.testLimit;
    const determinismRate = totalTests > 0 ? deterministicTests / totalTests : 1;

    return {
      summary: {
        totalTests,
        deterministicTests,
        raceConditionTests,
        determinismRate,
      },
      testResults,
    };
  }
}

/**
 * Create a concurrent property for testing race conditions.
 */
export function forAllConcurrent<T>(
  generator: Gen<T>,
  property: (input: T) => unknown | Promise<unknown>,
  workerCount: number = 4
): ConcurrentProperty<T> {
  return new ConcurrentProperty(generator, property, {
    ...defaultConcurrentConfig(),
    workerCount,
  });
}

/**
 * Utility function for basic race condition detection.
 */
export async function detectRaceConditions<T>(
  generator: Gen<T>,
  property: (input: T) => unknown | Promise<unknown>,
  options: {
    testCount: number;
    workerCount: number;
    repetitions: number;
  }
): Promise<{
  determinismRate: number;
  hasRaceConditions: boolean;
  patterns: Array<{ description: string; frequency: number }>;
}> {
  const config = new Config({ testLimit: options.testCount });
  const concurrentProperty = new ConcurrentProperty(generator, property, {
    workerCount: options.workerCount,
    testTimeout: 15000,
    repetitions: options.repetitions,
  });

  const result = await concurrentProperty.run(config);

  return {
    determinismRate: result.summary.determinismRate,
    hasRaceConditions: result.summary.raceConditionTests > 0,
    patterns: result.summary.raceConditionTests > 0 ? [
      {
        description: 'Non-deterministic behavior detected',
        frequency: result.summary.raceConditionTests / result.summary.totalTests,
      }
    ] : [],
  };
}
