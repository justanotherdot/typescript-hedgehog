import { Seed } from '../data/seed';
import { Size } from '../data/size';
import { Tree } from '../data/tree';

/**
 * Generator function type.
 */
export type GeneratorFn<T> = (size: Size, seed: Seed) => Tree<T>;

/**
 * Core generator class.
 *
 * A generator represents a way to produce random values of type T,
 * along with shrinking information for property-based testing.
 */
export class Gen<T> {
  constructor(private generator: GeneratorFn<T>) {}

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

  // Static methods for generator creation
  // These are placeholders that will be overridden when modules are imported
}
