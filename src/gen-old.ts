import { GeneratorFn } from './gen/core.js';
import { Size } from './data/size.js';
import { Tree } from './data/tree.js';
import { Seed } from './data/seed.js';

/**
 * Generator class for property-based testing.
 *
 * A generator represents a way to produce random values of type T,
 * along with shrinking information for property-based testing.
 */
export class Gen<T> {
  constructor(public readonly generator: GeneratorFn<T>) {}

  /**
   * Generate a value using the given size and seed.
   */
  generate(size: Size, seed: Seed): Tree<T> {
    return this.generator(size, seed);
  }

  /**
   * Map a function over the generated values.
   */
  map<U>(fn: (value: T) => U): Gen<U> {
    return Gen.create((size, seed) => {
      const tree = this.generate(size, seed);
      return tree.map(fn);
    });
  }

  /**
   * Chain generators together (monadic bind).
   */
  chain<U>(fn: (value: T) => Gen<U>): Gen<U> {
    return Gen.create((size, seed) => {
      const tree = this.generate(size, seed);
      const [, rightSeed] = seed.split();

      // Use Tree.bind for monadic composition
      return tree.bind((value: T) => {
        const nextGen = fn(value);
        return nextGen.generate(size, rightSeed);
      });
    });
  }

  /**
   * Filter generated values, retrying if predicate fails.
   */
  filter(predicate: (value: T) => boolean, maxRetries = 100): Gen<T> {
    return Gen.create((size, seed) => {
      let currentSeed = seed;

      for (let i = 0; i < maxRetries; i++) {
        const tree = this.generate(size, currentSeed);
        if (predicate(tree.value)) {
          // Filter shrinks as well
          const filteredShrinks = tree
            .shrinks()
            .filter((value) => predicate(value))
            .map((value) => Tree.singleton(value));
          return Tree.withChildren(tree.value, filteredShrinks);
        }

        // Try with a new seed
        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
      }

      throw new Error(
        `Failed to generate value satisfying predicate after ${maxRetries} attempts`
      );
    });
  }

  /**
   * Scale the size parameter passed to this generator.
   */
  resize(fn: (size: Size) => Size): Gen<T> {
    return Gen.create((size, seed) => {
      const newSize = fn(size);
      return this.generate(newSize, seed);
    });
  }

  /**
   * Alias for resize - scale the size parameter.
   */
  scale(fn: (size: Size) => Size): Gen<T> {
    return this.resize(fn);
  }

  /**
   * Alias for chain (for compatibility).
   */
  bind<U>(fn: (value: T) => Gen<U>): Gen<U> {
    return this.chain(fn);
  }

  /**
   * Set a specific size for this generator.
   */
  withSize(size: number): Gen<T> {
    return this.resize(() => Size.of(size));
  }

  /**
   * Generate a sample value for testing/debugging.
   */
  sample(seed?: Seed, size?: Size): T {
    const actualSeed = seed ?? Seed.random();
    const actualSize = size ?? Size.of(10);
    const tree = this.generate(actualSize, actualSeed);
    return tree.value;
  }

  /**
   * Generate multiple sample values.
   */
  samples(count: number, seed?: Seed, size?: Size): T[] {
    let currentSeed = seed ?? Seed.random();
    const actualSize = size ?? Size.of(10);
    const results: T[] = [];

    for (let i = 0; i < count; i++) {
      const tree = this.generate(actualSize, currentSeed);
      results.push(tree.value);

      const [, newSeed] = currentSeed.split();
      currentSeed = newSeed;
    }

    return results;
  }

  // Static factory methods

  /**
   * Create a generator from a function.
   */
  static create<T>(fn: GeneratorFn<T>): Gen<T> {
    return new Gen(fn);
  }

  /**
   * Create a generator that accesses the current size.
   */
  static sized<T>(fn: (size: Size) => Gen<T>): Gen<T> {
    return Gen.create((size, seed) => fn(size).generate(size, seed));
  }

  /**
   * Create a generator that always produces the same value.
   */
  static constant<T extends string | number | boolean | symbol>(
    value: T
  ): Gen<T> {
    return new Gen(() => Tree.singleton(value));
  }

  /**
   * Choose from generators with equal probability.
   */
  static oneOf<T>(generators: Gen<T>[]): Gen<T> {
    if (generators.length === 0) {
      throw new Error('oneOf requires at least one generator');
    }

    return Gen.create((size, seed) => {
      const [index] = seed.nextBounded(generators.length);
      return generators[index].generate(size, seed);
    });
  }

  /**
   * Choose from alternatives with weighted probabilities.
   */
  static frequency<T>(choices: Array<[number, Gen<T>]>): Gen<T> {
    if (choices.length === 0) {
      throw new Error('frequency requires at least one choice');
    }

    const totalWeight = choices.reduce((sum, [weight]) => sum + weight, 0);
    if (totalWeight <= 0) {
      throw new Error('frequency requires positive total weight');
    }

    return Gen.create((size, seed) => {
      const [randomValue] = seed.nextFloat();
      const target = randomValue * totalWeight;

      let currentWeight = 0;
      for (const [weight, gen] of choices) {
        currentWeight += weight;
        if (target <= currentWeight) {
          return gen.generate(size, seed);
        }
      }

      // Fallback to last generator (shouldn't happen due to floating point precision)
      return choices[choices.length - 1][1].generate(size, seed);
    });
  }

  // Simple static methods that will delegate to implementations
  // These will be overridden below with actual implementations

  static number = createNumGen;
  static date = createDateGen;
  static enum = createEnumGen;
  static literal = createLiteralGen;
  static array = createArrayGen;
  static arrayOfLength = createArrayOfLengthGen;
  static object = createObjectGen;
  static tuple = createTupleGen;
  static optional = createOptionalGen;
  static nullable = createNullableGen;
  static union = createUnionGen;
  static discriminatedUnion = createDiscriminatedUnionGen;
  static weightedUnion = createWeightedUnionGen;
}

// Import the actual implementations
import { number } from './gen/primitive.js';
import { date } from './gen/primitive.js';
import { enumValue } from './gen/primitive.js';
import { literal } from './gen/primitive.js';
import {
  array,
  arrayOfLength,
  object,
  tuple,
  ArrayOptions,
} from './gen/collection.js';
import {
  optional,
  nullable,
  union,
  discriminatedUnion,
  weightedUnion,
} from './gen/union.js';

// Helper functions to bridge the type gap
function createNumGen(options?: {
  min?: number;
  max?: number;
  multipleOf?: number;
  finite?: boolean;
  safe?: boolean;
}): Gen<number> {
  const coreGen = number(options);
  return new Gen((coreGen as any).generator);
}

function createDateGen(options?: { min?: Date; max?: Date }): Gen<Date> {
  const coreGen = date(options);
  return new Gen((coreGen as any).generator);
}

function createEnumGen<T extends readonly [string, ...string[]]>(
  values: T
): Gen<T[number]> {
  const coreGen = enumValue(values);
  return new Gen((coreGen as any).generator);
}

function createLiteralGen<T extends string | number | boolean>(
  value: T
): Gen<T> {
  const coreGen = literal(value);
  return new Gen((coreGen as any).generator);
}

function createArrayGen<T>(gen: Gen<T>, options?: ArrayOptions): Gen<T[]> {
  // Convert our Gen to core Gen for compatibility
  const coreGen = new (Gen as any)((gen as any).generator);
  const result = array(coreGen, options);
  return new Gen((result as any).generator);
}

function createArrayOfLengthGen<T>(gen: Gen<T>, length: number): Gen<T[]> {
  const coreGen = new (Gen as any)((gen as any).generator);
  const result = arrayOfLength(coreGen, length);
  return new Gen((result as any).generator);
}

function createObjectGen<T extends Record<string, unknown>>(generators: {
  [K in keyof T]: Gen<T[K]>;
}): Gen<T> {
  // Convert each Gen to core Gen
  const coreGenerators: any = {};
  for (const key in generators) {
    coreGenerators[key] = new (Gen as any)((generators[key] as any).generator);
  }
  const result = object(coreGenerators);
  return new Gen((result as any).generator);
}

function createTupleGen<T extends readonly unknown[]>(
  ...generators: { [K in keyof T]: Gen<T[K]> }
): Gen<T> {
  // Convert each Gen to core Gen
  const coreGenerators = generators.map(
    (gen) => new (Gen as any)((gen as any).generator)
  ) as any;
  const result = tuple<T>(...coreGenerators);
  return new Gen((result as any).generator);
}

function createOptionalGen<T>(gen: Gen<T>): Gen<T | undefined> {
  const coreGen = new (Gen as any)((gen as any).generator);
  const result = optional(coreGen);
  return new Gen((result as any).generator);
}

function createNullableGen<T>(gen: Gen<T>): Gen<T | null> {
  const coreGen = new (Gen as any)((gen as any).generator);
  const result = nullable(coreGen);
  return new Gen((result as any).generator);
}

function createUnionGen<T extends readonly unknown[]>(
  ...generators: { [K in keyof T]: Gen<T[K]> }
): Gen<T[number]> {
  const coreGenerators = generators.map(
    (gen) => new (Gen as any)((gen as any).generator)
  ) as any;
  const result = union(...coreGenerators);
  return new Gen((result as any).generator);
}

function createDiscriminatedUnionGen<
  K extends string,
  T extends Record<string, unknown>,
>(
  discriminatorKey: K,
  variants: Record<string, Gen<T & Record<K, string>>>
): Gen<T & Record<K, string>> {
  // Convert each Gen to core Gen
  const coreVariants: any = {};
  for (const key in variants) {
    coreVariants[key] = new (Gen as any)((variants[key] as any).generator);
  }
  const result = discriminatedUnion(discriminatorKey, coreVariants);
  return new Gen((result as any).generator);
}

function createWeightedUnionGen<T>(choices: Array<[number, Gen<T>]>): Gen<T> {
  const coreChoices = choices.map(([weight, gen]) => [
    weight,
    new (Gen as any)((gen as any).generator),
  ]) as any;
  const result = weightedUnion(coreChoices);
  return new Gen((result as any).generator);
}

// Re-export types and functions
export type { GeneratorFn } from './gen/core.js';
export * from './gen/primitive.js';
export * from './gen/collection.js';
export * from './gen/union.js';
