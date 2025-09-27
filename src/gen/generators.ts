/**
 * Core generator functions - pure functions that return GeneratorFn<T>.
 *
 * This module contains the fundamental generator building blocks without
 * the Gen class wrapper, allowing other modules to import them without
 * circular dependencies.
 */

import { GeneratorFn } from './core.js';
import { Size } from '../data/size.js';
import { Tree } from '../data/tree.js';

/**
 * Create a generator from a function.
 */
export function create<T>(fn: GeneratorFn<T>): GeneratorFn<T> {
  return fn;
}

/**
 * Create a generator that depends on the current size.
 */
export function sized<T>(fn: (size: Size) => GeneratorFn<T>): GeneratorFn<T> {
  return (size, seed) => fn(size)(size, seed);
}

/**
 * Generate a constant value.
 */
export function constant<T>(value: T): GeneratorFn<T> {
  return () => Tree.singleton(value);
}

/**
 * Choose one generator from a list with equal probability.
 */
export function oneOf<T>(generators: GeneratorFn<T>[]): GeneratorFn<T> {
  if (generators.length === 0) {
    throw new Error('oneOf requires at least one generator');
  }

  return (size, seed) => {
    const [index] = seed.nextBounded(generators.length);
    return generators[index](size, seed);
  };
}

/**
 * Choose generators based on weighted frequency.
 */
export function frequency<T>(choices: Array<[number, GeneratorFn<T>]>): GeneratorFn<T> {
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