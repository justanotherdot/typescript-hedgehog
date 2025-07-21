import { Seed } from './data/seed';
import { Size } from './data/size';
import { Tree } from './data/tree';
import {
  array,
  arrayOfLength,
  object,
  tuple,
  ArrayOptions,
} from './gen/collection.js';

// Re-export collection generators
export { array, arrayOfLength, object, tuple, ArrayOptions };

/**
 * A generator for test data of type `T`.
 *
 * Generators are explicit, first-class values that can be composed
 * using combinator functions. This is a key difference from
 * type-directed approaches like QuickCheck.
 */
export class Gen<T> {
  constructor(
    private readonly generator: (size: Size, seed: Seed) => Tree<T>
  ) {}

  /**
   * Create a new generator from a function.
   */
  static create<T>(f: (size: Size, seed: Seed) => Tree<T>): Gen<T> {
    return new Gen(f);
  }

  /**
   * Generate a value using the given size and seed.
   */
  generate(size: Size, seed: Seed): Tree<T> {
    return this.generator(size, seed);
  }

  /**
   * Create a generator that always produces the same value.
   */
  static constant<T>(value: T): Gen<T> {
    return new Gen(() => Tree.singleton(value));
  }

  /**
   * Map a function over the generated values.
   */
  map<U>(f: (value: T) => U): Gen<U> {
    return new Gen((size, seed) => {
      const tree = this.generate(size, seed);
      return tree.map(f);
    });
  }

  /**
   * Filter generated values, keeping only those that satisfy the predicate.
   */
  filter(predicate: (value: T) => boolean): Gen<T> {
    return new Gen((size, seed) => {
      let attempts = 0;
      const maxAttempts = 100;
      let currentSeed = seed;

      while (attempts < maxAttempts) {
        const tree = this.generate(size, currentSeed);
        const filtered = tree.filter(predicate);

        if (filtered !== null) {
          return filtered;
        }

        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
        attempts++;
      }

      throw new Error(
        `Failed to generate value satisfying predicate after ${maxAttempts} attempts`
      );
    });
  }

  /**
   * Monadic bind operation for generators.
   */
  bind<U>(f: (value: T) => Gen<U>): Gen<U> {
    return new Gen((size, seed) => {
      const tree = this.generate(size, seed);
      return tree.bind((value) => f(value).generate(size, seed));
    });
  }

  /**
   * Choose one of the given generators with equal probability.
   */
  static oneOf<T>(generators: Gen<T>[]): Gen<T> {
    if (generators.length === 0) {
      throw new Error('oneOf requires at least one generator');
    }

    return new Gen((size, seed) => {
      const [index, newSeed] = seed.nextBounded(generators.length);
      return generators[index].generate(size, newSeed);
    });
  }

  /**
   * Choose one of the given generators with weighted probability.
   */
  static frequency<T>(choices: Array<[number, Gen<T>]>): Gen<T> {
    if (choices.length === 0) {
      throw new Error('frequency requires at least one choice');
    }

    const totalWeight = choices.reduce((sum, [weight]) => sum + weight, 0);
    if (totalWeight <= 0) {
      throw new Error('frequency requires positive total weight');
    }

    return new Gen((size, seed) => {
      const [random, newSeed] = seed.nextBounded(totalWeight);
      let currentWeight = 0;

      for (const [weight, generator] of choices) {
        currentWeight += weight;
        if (random < currentWeight) {
          return generator.generate(size, newSeed);
        }
      }

      return choices[choices.length - 1][1].generate(size, newSeed);
    });
  }

  /**
   * Create a generator that chooses between two generators based on size.
   * For small sizes, use the first generator; for larger sizes, use the second.
   */
  static sized<T>(f: (size: Size) => Gen<T>): Gen<T> {
    return new Gen((size, seed) => {
      const gen = f(size);
      return gen.generate(size, seed);
    });
  }

  /**
   * Scale the size parameter for this generator.
   */
  scale(f: (size: Size) => Size): Gen<T> {
    return new Gen((size, seed) => {
      const newSize = f(size);
      return this.generate(newSize, seed);
    });
  }

  /**
   * Generate arrays with configurable length and element shrinking.
   */
  static array<T>(elementGen: Gen<T>, options?: ArrayOptions): Gen<T[]> {
    return array(elementGen, options);
  }

  /**
   * Generate arrays of exactly the specified length.
   */
  static arrayOfLength<T>(elementGen: Gen<T>, length: number): Gen<T[]> {
    return arrayOfLength(elementGen, length);
  }

  /**
   * Generate objects with typed properties.
   */
  static object<T extends Record<string, any>>(schema: {
    [K in keyof T]: Gen<T[K]>;
  }): Gen<T> {
    return object(schema);
  }

  /**
   * Generate fixed-length heterogeneous tuples.
   */
  static tuple<T extends readonly unknown[]>(
    ...generators: { [K in keyof T]: Gen<T[K]> }
  ): Gen<T> {
    return tuple<T>(...generators);
  }
}
