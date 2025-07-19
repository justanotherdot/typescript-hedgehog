/**
 * Core property testing functionality.
 */

import { Gen } from './gen';
import { Size } from './data/size';
import { Seed } from './data/seed';
import { Tree } from './data/tree';
import { Config } from './config';
import {
  TestResult,
  TestCase,
  TestStats,
  passResult,
  failResult,
  gaveUpResult,
  emptyStats,
  addTest,
  addShrinks,
  addLabel,
} from './result';

/**
 * A property that can be tested.
 */
export class Property<T> {
  constructor(
    private readonly generator: Gen<T>,
    private readonly predicate: (value: T) => boolean,
    private readonly labels: Array<(value: T) => string | null> = []
  ) {}

  /**
   * Add a label to classify test cases.
   */
  classify(label: string, condition: (value: T) => boolean): Property<T> {
    const labelFn = (value: T) => (condition(value) ? label : null);
    return new Property(this.generator, this.predicate, [
      ...this.labels,
      labelFn,
    ]);
  }

  /**
   * Collect statistics about generated values.
   */
  collect(labelFn: (value: T) => string): Property<T> {
    const collectFn = (value: T) => labelFn(value);
    return new Property(this.generator, this.predicate, [
      ...this.labels,
      collectFn,
    ]);
  }

  /**
   * Run this property with the given configuration.
   */
  run(
    config: Config = Config.default(),
    seed: Seed = Seed.random()
  ): TestResult<T> {
    return runProperty(
      this.generator,
      this.predicate,
      this.labels,
      config,
      seed
    );
  }
}

/**
 * Create a property from a generator and predicate.
 */
export function forAll<T>(
  generator: Gen<T>,
  predicate: (value: T) => boolean
): Property<T> {
  return new Property(generator, predicate);
}

/**
 * Internal function to run a property test.
 */
function runProperty<T>(
  generator: Gen<T>,
  predicate: (value: T) => boolean,
  labels: Array<(value: T) => string | null>,
  config: Config,
  seed: Seed
): TestResult<T> {
  let stats = emptyStats();
  let currentSeed = seed;
  let discardCount = 0;

  // Main test loop
  for (let testNum = 0; testNum < config.testLimit; testNum++) {
    // Calculate size for this test (grows linearly with test number)
    const sizeValue = Math.min(
      config.sizeLimit,
      Math.floor((testNum * config.sizeLimit) / config.testLimit)
    );
    const size = Size.of(sizeValue);

    // Split seed for this test
    const [testSeed, nextSeed] = currentSeed.split();
    currentSeed = nextSeed;

    try {
      // Generate a test case
      const tree = generator.generate(size, testSeed);
      const testCase: TestCase<T> = {
        value: tree.value,
        size,
        seed: testSeed,
      };

      // Apply labels
      for (const labelFn of labels) {
        const label = labelFn(tree.value);
        if (label !== null) {
          stats = addLabel(stats, label);
        }
      }

      // Test the predicate
      const passed = predicate(tree.value);

      if (passed) {
        // Test passed, continue
        stats = addTest(stats);
      } else {
        // Test failed, try to shrink
        const shrinkResult = shrinkFailure(
          tree,
          predicate,
          config,
          testCase,
          stats
        );
        return shrinkResult;
      }
    } catch (_error) {
      // Generation failed (e.g., filter rejected too many values)
      discardCount++;
      stats = addTest(stats, true); // Mark as discarded

      if (discardCount >= config.discardLimit) {
        return gaveUpResult(
          stats,
          `Too many discarded tests (${discardCount}/${config.discardLimit})`
        );
      }
    }
  }

  // All tests passed
  return passResult(stats);
}

/**
 * Shrink a failing test case to find the minimal counterexample.
 */
function shrinkFailure<T>(
  failingTree: Tree<T>,
  predicate: (value: T) => boolean,
  config: Config,
  originalFailure: TestCase<T>,
  stats: TestStats
): TestResult<T> {
  // Find the minimal counterexample using depth-first traversal
  const shrinkResult = shrinkToMinimal(failingTree, predicate, config);

  const finalStats = addShrinks(stats, shrinkResult.steps);

  const counterexample: TestCase<T> = {
    value: shrinkResult.tree.value,
    size: originalFailure.size,
    seed: originalFailure.seed,
  };

  return failResult(
    finalStats,
    originalFailure,
    counterexample,
    shrinkResult.path
  );
}

/**
 * Result of shrinking operation.
 */
interface ShrinkResult<T> {
  tree: Tree<T>;
  steps: number;
  path: TestCase<T>[];
}

/**
 * Find the minimal failing value using depth-first traversal.
 * This follows the approach used in reference Hedgehog implementations.
 */
function shrinkToMinimal<T>(
  tree: Tree<T>,
  predicate: (value: T) => boolean,
  config: Config,
  steps: number = 0,
  path: TestCase<T>[] = []
): ShrinkResult<T> {
  // Try each child in order (leftmost first)
  for (const child of tree.children) {
    if (steps >= config.shrinkLimit) {
      break;
    }

    try {
      const childStillFails = !predicate(child.value);

      if (childStillFails) {
        // This child still fails, so it's a better (smaller) counterexample
        const childTestCase: TestCase<T> = {
          value: child.value,
          size: path.length > 0 ? path[0].size : Size.of(0), // Use original size
          seed: path.length > 0 ? path[0].seed : Seed.random(), // Use original seed
        };

        const newPath = [...path, childTestCase];

        // Recursively shrink this child to find an even smaller failure
        return shrinkToMinimal(child, predicate, config, steps + 1, newPath);
      }
    } catch (_error) {
      // Child caused an error during testing, skip it
      continue;
    }
  }

  // No child failed, so this is the minimal counterexample
  return {
    tree,
    steps,
    path,
  };
}
