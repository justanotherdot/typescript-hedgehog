/**
 * Core property testing functionality.
 */

import { Gen } from './gen.js';
import { Size } from './data/size.js';
import { Seed } from './data/seed.js';
import { Tree } from './data/tree.js';
import { Config } from './config.js';
import {
  TestResult,
  TestCase,
  TestStats,
  FailResult,
  GaveUpResult,
  passResult,
  failResult,
  gaveUpResult,
  emptyStats,
  addTest,
  addShrinks,
  addLabel,
} from './result.js';

/**
 * A property that can be tested.
 */
export class Property<T> {
  constructor(
    private readonly generator: Gen<T>,
    private readonly predicate: (value: T) => boolean,
    private readonly labels: Array<(value: T) => string | null> = [],
    private readonly variableName?: string,
    private readonly examples: T[] = []
  ) {}

  /**
   * Add a label to classify test cases.
   */
  classify(label: string, condition: (value: T) => boolean): Property<T> {
    const labelFn = (value: T) => (condition(value) ? label : null);
    return new Property(
      this.generator,
      this.predicate,
      [...this.labels, labelFn],
      this.variableName,
      this.examples
    );
  }

  /**
   * Collect statistics about generated values.
   */
  collect(labelFn: (value: T) => string): Property<T> {
    const collectFn = (value: T) => labelFn(value);
    return new Property(
      this.generator,
      this.predicate,
      [...this.labels, collectFn],
      this.variableName,
      this.examples
    );
  }

  /**
   * Add a single example to test before random generation.
   */
  withExample(example: T): Property<T> {
    return new Property(
      this.generator,
      this.predicate,
      this.labels,
      this.variableName,
      [...this.examples, example]
    );
  }

  /**
   * Add multiple examples to test before random generation.
   */
  withExamples(examples: T[]): Property<T> {
    return new Property(
      this.generator,
      this.predicate,
      this.labels,
      this.variableName,
      [...this.examples, ...examples]
    );
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
      seed,
      this.examples
    );
  }

  /**
   * Check this property, throwing on failure with formatted output.
   */
  check(config: Config = Config.default(), seed: Seed = Seed.random()): void {
    const result = this.run(config, seed);

    if (result.type === 'fail') {
      throw new Error(formatFailure(result, this.variableName));
    } else if (result.type === 'gave-up') {
      throw new Error(formatGaveUp(result));
    }
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
 * Create a named property from a generator and predicate.
 * The variable name will be shown in failure reports.
 */
export function forAllNamed<T>(
  variableName: string,
  generator: Gen<T>,
  predicate: (value: T) => boolean
): Property<T> {
  return new Property(generator, predicate, [], variableName);
}

/**
 * Internal function to run a property test.
 */
function runProperty<T>(
  generator: Gen<T>,
  predicate: (value: T) => boolean,
  labels: Array<(value: T) => string | null>,
  config: Config,
  seed: Seed,
  examples: T[] = []
): TestResult<T> {
  let stats = emptyStats();
  let currentSeed = seed;
  let discardCount = 0;

  // Test examples first
  for (let exampleIndex = 0; exampleIndex < examples.length; exampleIndex++) {
    const example = examples[exampleIndex];

    // Split seed for this example
    const [exampleSeed, nextSeed] = currentSeed.split();
    currentSeed = nextSeed;

    const exampleTestCase: TestCase<T> = {
      value: example,
      size: Size.of(0),
      seed: exampleSeed,
    };

    // Test the example
    if (!predicate(example)) {
      // Example failed - no shrinking for examples
      return failResult(stats, exampleTestCase, exampleTestCase, []);
    }

    // Update stats with labels
    for (const labelFn of labels) {
      const label = labelFn(example);
      if (label) {
        stats = addLabel(stats, label);
      }
    }
    stats = addTest(stats);
  }

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
 * Format a failing test result for display.
 */
function formatFailure<T>(
  result: FailResult<T>,
  variableName?: string
): string {
  const lines = ['Property failed:'];

  lines.push('');
  lines.push(`Counterexample (after ${result.stats.shrinkSteps} shrinks):`);
  const counterexampleStr = variableName
    ? `forAll 0 = ${formatValue(result.counterexample.value)} -- ${variableName}`
    : formatValue(result.counterexample.value);
  lines.push(`  ${counterexampleStr}`);

  if (result.stats.shrinkSteps > 0) {
    lines.push('');
    lines.push('Original failure:');
    const originalStr = variableName
      ? `forAll 0 = ${formatValue(result.originalFailure.value)} -- ${variableName}`
      : formatValue(result.originalFailure.value);
    lines.push(`  ${originalStr}`);
  }

  lines.push('');
  lines.push('Reproduce with:');
  lines.push(`  seed: ${result.counterexample.seed.toString()}`);
  lines.push(`  size: ${result.counterexample.size.get()}`);

  if (result.stats.testsRun > 0) {
    lines.push('');
    lines.push(`Passed ${result.stats.testsRun} tests before failing`);
  }

  if (result.stats.labels.size > 0) {
    lines.push('');
    lines.push('Classification:');
    for (const [label, count] of result.stats.labels.entries()) {
      const percentage = ((count / result.stats.testsRun) * 100).toFixed(1);
      lines.push(`  ${label}: ${count} (${percentage}%)`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a gave-up test result for display.
 */
function formatGaveUp(result: GaveUpResult): string {
  const lines = ['Property gave up:'];
  lines.push('');
  lines.push(result.reason);
  lines.push('');
  lines.push(`Tests run: ${result.stats.testsRun}`);
  lines.push(`Tests discarded: ${result.stats.testsDiscarded}`);
  return lines.join('\n');
}

/**
 * Format a value for display.
 */
function formatValue<T>(value: T): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  } else if (Array.isArray(value)) {
    if (value.length > 10) {
      const preview = value.slice(0, 10).map(formatValue).join(', ');
      return `[${preview}, ... (${value.length} items total)]`;
    }
    return `[${value.map(formatValue).join(', ')}]`;
  } else if (value && typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
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
