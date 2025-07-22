import { Seed } from '../data/seed.js';
import { Size } from '../data/size.js';
import { Tree } from '../data/tree.js';

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
