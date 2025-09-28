import { Seed } from '../data/seed.js';
import { Size } from '../data/size.js';
import { Tree } from '../data/tree.js';
import { shrinkBuilder } from './shrink.js';

/**
 * Generator function type.
 */
export type GeneratorFn<T> = (size: Size, seed: Seed) => Tree<T>;

// Core primitive functions that other modules can use - these return GeneratorFn directly

/**
 * Create a generator function from a function.
 */
export function create<T>(fn: GeneratorFn<T>): GeneratorFn<T> {
  return fn;
}

/**
 * Create a generator function that accesses the current size.
 */
export function sized<T>(fn: (size: Size) => GeneratorFn<T>): GeneratorFn<T> {
  return (size, seed) => fn(size)(size, seed);
}

/**
 * Create a generator function that always produces the same value.
 */
export function constant<T extends string | number | boolean | symbol>(
  value: T
): GeneratorFn<T> {
  return () => Tree.singleton(value);
}

/**
 * Choose from generator functions with equal probability.
 */
export function oneOf<T>(...generators: GeneratorFn<T>[]): GeneratorFn<T> {
  if (generators.length === 0) {
    throw new Error('oneOf requires at least one generator');
  }

  return (size, seed) => {
    const [index] = seed.nextBounded(generators.length);
    return generators[index](size, seed);
  };
}

/**
 * Choose from alternatives with weighted probabilities.
 */
export function frequency<T>(
  choices: Array<[number, GeneratorFn<T>]>
): GeneratorFn<T> {
  if (choices.length === 0) {
    throw new Error('frequency requires at least one choice');
  }

  const totalWeight = choices.reduce((sum, [weight]) => sum + weight, 0);
  if (totalWeight <= 0) {
    throw new Error('frequency requires positive total weight');
  }

  return (size, seed) => {
    const [randomValue] = seed.nextFloat();
    const target = randomValue * totalWeight;

    let currentWeight = 0;
    for (const [weight, gen] of choices) {
      currentWeight += weight;
      if (target <= currentWeight) {
        return gen(size, seed);
      }
    }

    // Fallback to last generator
    return choices[choices.length - 1][1](size, seed);
  };
}

// Helper functions for common generator patterns

/**
 * Generate a value from a fixed set of choices with shrinking towards the first element.
 * Common pattern for enums, literals, and fixed sets.
 */
export function choiceOf<T>(choices: readonly T[]): GeneratorFn<T> {
  if (choices.length === 0) {
    throw new Error('choiceOf requires at least one choice');
  }

  return create((_size, seed) => {
    const [index] = seed.nextBounded(choices.length);
    const value = choices[index];

    const builder = shrinkBuilder<T>();

    // Shrink towards first element if not already first
    if (index > 0) {
      builder.add(choices[0]);
    }

    return builder.build(value);
  });
}

/**
 * Calculate size-based probability that decreases as size increases.
 * Common pattern for optional/nullable generation.
 */
export function sizeBiasedProbability(
  size: Size,
  baseProbability: number = 0.5,
  rate: number = 0.004,
  minProbability: number = 0.05
): number {
  return Math.max(minProbability, baseProbability - size.get() * rate);
}

/**
 * Create a generator that chooses between two alternatives based on probability.
 * Common pattern for optional/nullable values.
 */
export function probabilityChoice<A, B>(
  probability: number,
  primaryGen: GeneratorFn<A>,
  alternativeGen: GeneratorFn<B>,
  shrinkToPrimary: boolean = true
): GeneratorFn<A | B> {
  return create((size, seed) => {
    const [shouldChooseAlternative, newSeed] = seed.nextFloat();

    if (shouldChooseAlternative < probability) {
      // Generate alternative value
      const altTree = alternativeGen(size, newSeed);
      const builder = shrinkBuilder<A | B>();

      if (shrinkToPrimary) {
        // Shrink to primary value
        const primaryTree = primaryGen(size, newSeed);
        builder.add(primaryTree.value);
      }

      return builder.build(altTree.value);
    } else {
      // Generate primary value
      const tree = primaryGen(size, newSeed);
      const builder = shrinkBuilder<A | B>();

      if (!shrinkToPrimary) {
        // Shrink to alternative value
        const altTree = alternativeGen(size, newSeed);
        builder.add(altTree.value);
      }

      // Include shrinks from the primary generator
      builder.addFromTree(tree);

      return builder.build(tree.value);
    }
  });
}

/**
 * Generate values within constraints using a transform function.
 * Common pattern for constrained generation (numbers, dates, etc.).
 */
export function constrainedValue<T>(
  generateRaw: (seed: Seed) => [T, Seed],
  isValid: (value: T) => boolean,
  buildShrinks: (value: T) => Tree<T>[]
): GeneratorFn<T> {
  return create((_size, seed) => {
    const [value, _newSeed] = generateRaw(seed);

    if (!isValid(value)) {
      throw new Error('Generated value does not satisfy constraints');
    }

    const shrinks = buildShrinks(value);
    return Tree.withChildren(value, shrinks);
  });
}

/**
 * Generate collections by applying a generator to each element position.
 * Common pattern for arrays, objects, and tuples.
 */
export function mapElements<T, U>(
  elements: T[],
  elementGenerator: (element: T, index: number) => GeneratorFn<U>,
  combineResults: (results: U[], elementTrees: Tree<U>[]) => Tree<U[]>
): GeneratorFn<U[]> {
  return create((size, seed) => {
    if (elements.length === 0) {
      return Tree.singleton([]);
    }

    const results: U[] = [];
    const elementTrees: Tree<U>[] = [];
    let currentSeed = seed;

    // Generate all elements
    for (let i = 0; i < elements.length; i++) {
      const [seed1, seed2] = currentSeed.split();
      const gen = elementGenerator(elements[i], i);
      const tree = gen(size, seed1);
      results.push(tree.value);
      elementTrees.push(tree);
      currentSeed = seed2;
    }

    return combineResults(results, elementTrees);
  });
}

/**
 * Helper for building shrinks of collections by shrinking individual elements.
 * Common pattern across arrays, objects, and tuples.
 */
export function buildCollectionShrinks<T>(
  elements: T[],
  elementTrees: Tree<T>[],
  updateElement: (elements: T[], index: number, newValue: T) => T[]
): Tree<T[]>[] {
  const builder = shrinkBuilder<T[]>();

  // Shrink individual elements
  for (let i = 0; i < elements.length; i++) {
    const elementTree = elementTrees[i];
    if (elementTree.hasShrinks()) {
      for (const shrunkElement of elementTree.shrinks()) {
        const shrunkArray = updateElement(elements, i, shrunkElement);
        builder.add(shrunkArray);
      }
    }
  }

  return builder.getShrinks();
}
