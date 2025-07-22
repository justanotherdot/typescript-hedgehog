// Public interface for the Hedgehog generator library
import { GeneratorFn } from './gen/core.js';
import { Size, Range } from './data/size.js';
import { Seed } from './data/seed.js';
import { Tree } from './data/tree.js';

// Import generator functions
import {
  bool,
  int,
  string,
  stringOfLength,
  number,
  date,
  enumValue,
  literal,
  Ints as PrimitiveInts,
  Strings as PrimitiveStrings,
} from './gen/primitive.js';
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

/**
 * Options for number generation.
 */
export interface NumberOptions {
  min?: number;
  max?: number;
  multipleOf?: number;
  finite?: boolean;
  safe?: boolean;
}

/**
 * Options for date generation.
 */
export interface DateOptions {
  min?: Date;
  max?: Date;
}

/**
 * Main Generator class - the public interface for property-based testing.
 */
export class Gen<T> {
  constructor(public readonly generator: GeneratorFn<T>) {}

  generate(size: Size, seed: Seed): Tree<T> {
    return this.generator(size, seed);
  }

  map<U>(fn: (value: T) => U): Gen<U> {
    return Gen.create((size, seed) => {
      const tree = this.generate(size, seed);
      return tree.map(fn);
    });
  }

  chain<U>(fn: (value: T) => Gen<U>): Gen<U> {
    return Gen.create((size, seed) => {
      const tree = this.generate(size, seed);
      const [, rightSeed] = seed.split();

      return tree.bind((value: T) => {
        const nextGen = fn(value);
        return nextGen.generate(size, rightSeed);
      });
    });
  }

  filter(predicate: (value: T) => boolean, maxRetries = 100): Gen<T> {
    return Gen.create((size, seed) => {
      let currentSeed = seed;

      for (let i = 0; i < maxRetries; i++) {
        const tree = this.generate(size, currentSeed);
        if (predicate(tree.value)) {
          const filteredShrinks = tree
            .shrinks()
            .filter((value) => predicate(value))
            .map((value) => Tree.singleton(value));
          return Tree.withChildren(tree.value, filteredShrinks);
        }

        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
      }

      throw new Error(
        `Failed to generate value satisfying predicate after ${maxRetries} attempts`
      );
    });
  }

  resize(fn: (size: Size) => Size): Gen<T> {
    return Gen.create((size, seed) => {
      const newSize = fn(size);
      return this.generate(newSize, seed);
    });
  }

  scale(fn: (size: Size) => Size): Gen<T> {
    return this.resize(fn);
  }

  bind<U>(fn: (value: T) => Gen<U>): Gen<U> {
    return this.chain(fn);
  }

  withSize(size: number): Gen<T> {
    return this.resize(() => Size.of(size));
  }

  sample(seed?: Seed, size?: Size): T {
    const actualSeed = seed ?? Seed.random();
    const actualSize = size ?? Size.of(10);
    const tree = this.generate(actualSize, actualSeed);
    return tree.value;
  }

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
  // Core static methods
  static create<T>(fn: GeneratorFn<T>): Gen<T> {
    return new Gen(fn);
  }

  static sized<T>(fn: (size: Size) => Gen<T>): Gen<T> {
    return new Gen((size, seed) => fn(size).generate(size, seed));
  }

  static constant<T extends string | number | boolean | symbol>(
    value: T
  ): Gen<T> {
    return new Gen(() => Tree.singleton(value));
  }

  static oneOf<T>(generators: Gen<T>[]): Gen<T> {
    if (generators.length === 0) {
      throw new Error('oneOf requires at least one generator');
    }

    return new Gen((size, seed) => {
      const [index] = seed.nextBounded(generators.length);
      return generators[index].generate(size, seed);
    });
  }

  static frequency<T>(choices: Array<[number, Gen<T>]>): Gen<T> {
    if (choices.length === 0) {
      throw new Error('frequency requires at least one choice');
    }

    const totalWeight = choices.reduce((sum, [weight]) => sum + weight, 0);
    if (totalWeight <= 0) {
      throw new Error('frequency requires positive total weight');
    }

    return new Gen((size, seed) => {
      const [randomValue] = seed.nextFloat();
      const target = randomValue * totalWeight;

      let currentWeight = 0;
      for (const [weight, gen] of choices) {
        currentWeight += weight;
        if (target <= currentWeight) {
          return gen.generate(size, seed);
        }
      }

      // Fallback to last generator
      return choices[choices.length - 1][1].generate(size, seed);
    });
  }

  // Basic primitive generators
  static bool(): Gen<boolean> {
    const generatorFn = bool();
    return new Gen(generatorFn);
  }

  static int(range: Range<number>): Gen<number> {
    const generatorFn = int(range);
    return new Gen(generatorFn);
  }

  static string(): Gen<string> {
    const generatorFn = string();
    return new Gen(generatorFn);
  }

  static stringOfLength(length: number): Gen<string> {
    const generatorFn = stringOfLength(length);
    return new Gen(generatorFn);
  }

  // Extended primitive generators
  static number(options?: NumberOptions): Gen<number> {
    const generatorFn = number(options);
    return new Gen(generatorFn);
  }

  static date(options?: DateOptions): Gen<Date> {
    const generatorFn = date(options);
    return new Gen(generatorFn);
  }

  static enum<T extends readonly [string, ...string[]]>(
    values: T
  ): Gen<T[number]> {
    const generatorFn = enumValue(values);
    return new Gen(generatorFn);
  }

  static literal<T extends string | number | boolean>(value: T): Gen<T> {
    const generatorFn = literal(value);
    return new Gen(generatorFn);
  }

  // Collection generators
  static array<T>(gen: Gen<T>, options?: ArrayOptions): Gen<T[]> {
    const generatorFn = array(gen.generator, options);
    return new Gen(generatorFn);
  }

  static arrayOfLength<T>(gen: Gen<T>, length: number): Gen<T[]> {
    const generatorFn = arrayOfLength(gen.generator, length);
    return new Gen(generatorFn);
  }

  static object<T extends Record<string, unknown>>(generators: {
    [K in keyof T]: Gen<T[K]>;
  }): Gen<T> {
    const generatorFns = {} as { [K in keyof T]: GeneratorFn<T[K]> };
    for (const key in generators) {
      generatorFns[key] = generators[key].generator;
    }
    const generatorFn = object(generatorFns);
    return new Gen(generatorFn);
  }

  static tuple<T extends readonly unknown[]>(
    ...generators: { [K in keyof T]: Gen<T[K]> }
  ): Gen<T> {
    const generatorFns = generators.map((gen) => gen.generator) as {
      [K in keyof T]: GeneratorFn<T[K]>;
    };
    const generatorFn = tuple<T>(...generatorFns);
    return new Gen(generatorFn);
  }

  // Union generators
  static optional<T>(gen: Gen<T>): Gen<T | undefined> {
    const generatorFn = optional(gen.generator);
    return new Gen(generatorFn);
  }

  static nullable<T>(gen: Gen<T>): Gen<T | null> {
    const generatorFn = nullable(gen.generator);
    return new Gen(generatorFn);
  }

  static union<T extends readonly unknown[]>(
    ...generators: { [K in keyof T]: Gen<T[K]> }
  ): Gen<T[number]> {
    const generatorFns = generators.map((gen) => gen.generator) as {
      [K in keyof T]: GeneratorFn<T[K]>;
    };
    const generatorFn = union(...generatorFns);
    return new Gen(generatorFn);
  }

  static discriminatedUnion<
    K extends string,
    T extends Record<string, unknown>,
  >(
    discriminatorKey: K,
    variants: Record<string, Gen<T & Record<K, string>>>
  ): Gen<T & Record<K, string>> {
    const generatorFns: Record<string, GeneratorFn<T & Record<K, string>>> = {};
    for (const key in variants) {
      generatorFns[key] = variants[key].generator;
    }
    const generatorFn = discriminatedUnion(discriminatorKey, generatorFns);
    return new Gen(generatorFn);
  }

  static weightedUnion<T>(choices: Array<[number, Gen<T>]>): Gen<T> {
    const generatorFnChoices = choices.map(
      ([weight, gen]) => [weight, gen.generator] as [number, GeneratorFn<T>]
    );
    const generatorFn = weightedUnion(generatorFnChoices);
    return new Gen(generatorFn);
  }
}

// Re-export types and all generator functions
export type { GeneratorFn } from './gen/core.js';
export * from './gen/primitive.js';
export * from './gen/collection.js';
export * from './gen/union.js';

// Convenience generator objects that return Gen<T> instead of GeneratorFn<T>
export const Ints = {
  /** Small positive integers [0, 100] */
  small: (): Gen<number> => new Gen(PrimitiveInts.small()),

  /** Any positive integer [0, Number.MAX_SAFE_INTEGER] */
  positive: (): Gen<number> => new Gen(PrimitiveInts.positive()),

  /** Any integer [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] */
  any: (): Gen<number> => new Gen(PrimitiveInts.any()),

  /** Integers in a specific range */
  range: (min: number, max: number): Gen<number> =>
    new Gen(PrimitiveInts.range(min, max)),
} as const;

export const Strings = {
  /** ASCII strings of any length */
  ascii: (): Gen<string> => new Gen(PrimitiveStrings.ascii()),

  /** ASCII strings of specific length */
  asciiOfLength: (length: number): Gen<string> =>
    new Gen(PrimitiveStrings.asciiOfLength(length)),

  /** Alphabetic strings (a-z, A-Z) */
  alpha: (): Gen<string> => new Gen(PrimitiveStrings.alpha()),
} as const;
