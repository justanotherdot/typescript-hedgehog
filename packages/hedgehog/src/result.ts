/**
 * Result types for property testing.
 */

import { Size } from './data/size.js';
import { Seed } from './data/seed.js';

/**
 * Represents a test case that was executed.
 */
export interface TestCase<T> {
  /** The generated value that was tested. */
  readonly value: T;
  /** The size used for generation. */
  readonly size: Size;
  /** The seed used for generation. */
  readonly seed: Seed;
}

/**
 * Statistics collected during property testing.
 */
export interface TestStats {
  /** Total number of tests that were run. */
  readonly testsRun: number;
  /** Number of tests that were discarded (filtered out). */
  readonly testsDiscarded: number;
  /** Number of shrink steps attempted. */
  readonly shrinkSteps: number;
  /** Labels and their frequencies for test classification. */
  readonly labels: Map<string, number>;
}

/**
 * The result of running a property test.
 */
export type TestResult<T> = PassResult | FailResult<T> | GaveUpResult;

/**
 * The property passed all tests.
 */
export interface PassResult {
  readonly type: 'pass';
  readonly stats: TestStats;
}

/**
 * The property failed with a counterexample.
 */
export interface FailResult<T> {
  readonly type: 'fail';
  readonly stats: TestStats;
  /** The original failing test case. */
  readonly originalFailure: TestCase<T>;
  /** The minimal counterexample found through shrinking. */
  readonly counterexample: TestCase<T>;
  /** All shrink attempts that were tried. */
  readonly shrinkPath: TestCase<T>[];
}

/**
 * The property gave up due to too many discarded tests.
 */
export interface GaveUpResult {
  readonly type: 'gave-up';
  readonly stats: TestStats;
  /** The reason for giving up. */
  readonly reason: string;
}

/**
 * Create a successful test result.
 */
export function passResult(stats: TestStats): PassResult {
  return { type: 'pass', stats };
}

/**
 * Create a failed test result.
 */
export function failResult<T>(
  stats: TestStats,
  originalFailure: TestCase<T>,
  counterexample: TestCase<T>,
  shrinkPath: TestCase<T>[]
): FailResult<T> {
  return {
    type: 'fail',
    stats,
    originalFailure,
    counterexample,
    shrinkPath,
  };
}

/**
 * Create a gave-up test result.
 */
export function gaveUpResult(stats: TestStats, reason: string): GaveUpResult {
  return { type: 'gave-up', stats, reason };
}

/**
 * Create empty test statistics.
 */
export function emptyStats(): TestStats {
  return {
    testsRun: 0,
    testsDiscarded: 0,
    shrinkSteps: 0,
    labels: new Map(),
  };
}

/**
 * Update test statistics with a new test.
 */
export function addTest(
  stats: TestStats,
  discarded: boolean = false
): TestStats {
  return {
    testsRun: discarded ? stats.testsRun : stats.testsRun + 1,
    testsDiscarded: discarded ? stats.testsDiscarded + 1 : stats.testsDiscarded,
    shrinkSteps: stats.shrinkSteps,
    labels: stats.labels,
  };
}

/**
 * Update test statistics with shrink steps.
 */
export function addShrinks(stats: TestStats, steps: number): TestStats {
  return {
    testsRun: stats.testsRun,
    testsDiscarded: stats.testsDiscarded,
    shrinkSteps: stats.shrinkSteps + steps,
    labels: stats.labels,
  };
}

/**
 * Add a label to test statistics.
 */
export function addLabel(stats: TestStats, label: string): TestStats {
  const newLabels = new Map(stats.labels);
  newLabels.set(label, (newLabels.get(label) || 0) + 1);

  return {
    testsRun: stats.testsRun,
    testsDiscarded: stats.testsDiscarded,
    shrinkSteps: stats.shrinkSteps,
    labels: newLabels,
  };
}
