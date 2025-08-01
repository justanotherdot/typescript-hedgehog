import { GeneratorFn, create, sized, buildCollectionShrinks } from './core.js';
import { Tree } from '../data/tree.js';
import { shrinkBuilder } from './shrink.js';

/**
 * Collection generators for arrays, objects, and tuples.
 */

export interface ArrayOptions {
  minLength?: number;
  maxLength?: number;
  length?: number;
}

/**
 * Generate arrays with configurable length and element shrinking.
 */
export function array<T>(
  elementGen: GeneratorFn<T>,
  options: ArrayOptions = {}
): GeneratorFn<T[]> {
  const { minLength = 0, maxLength, length } = options;

  if (length !== undefined) {
    return arrayOfLength(elementGen, length);
  }

  return sized((size) => {
    const defaultMaxLength = size.get();
    const effectiveMaxLength = maxLength ?? defaultMaxLength;
    const finalMaxLength = Math.max(minLength, effectiveMaxLength);

    return create((_size, seed) => {
      const [length, newSeed] = seed.nextBounded(
        finalMaxLength - minLength + 1
      );
      const actualLength = minLength + length;
      return arrayOfLength(elementGen, actualLength)(_size, newSeed);
    });
  });
}

/**
 * Generate arrays of exactly the specified length.
 */
export function arrayOfLength<T>(
  elementGen: GeneratorFn<T>,
  length: number
): GeneratorFn<T[]> {
  return create((size, seed) => {
    if (length === 0) {
      return Tree.singleton([]);
    }

    const elements: T[] = [];
    const elementTrees: Tree<T>[] = [];
    let currentSeed = seed;

    // Generate all elements
    for (let i = 0; i < length; i++) {
      const [seed1, seed2] = currentSeed.split();
      const tree = elementGen(size, seed1);
      elements.push(tree.value);
      elementTrees.push(tree);
      currentSeed = seed2;
    }

    const builder = shrinkBuilder<T[]>();

    // Shrink by reducing length
    for (let newLength = 0; newLength < length; newLength++) {
      const shorterArray = elements.slice(0, newLength);
      builder.add(shorterArray);
    }

    // Shrink individual elements using helper
    const elementShrinks = buildCollectionShrinks(
      elements,
      elementTrees,
      (elems, index, newValue) => [
        ...elems.slice(0, index),
        newValue,
        ...elems.slice(index + 1),
      ]
    );
    for (const shrink of elementShrinks) {
      builder.addTree(shrink);
    }

    return builder.build(elements);
  });
}

/**
 * Generate objects with typed properties.
 */
export function object<T extends Record<string, unknown>>(schema: {
  [K in keyof T]: GeneratorFn<T[K]>;
}): GeneratorFn<T> {
  return create((size, seed) => {
    const keys = Object.keys(schema) as Array<keyof T>;
    if (keys.length === 0) {
      return Tree.singleton({} as T);
    }

    const values: Partial<T> = {};
    const valueTrees = {} as Record<keyof T, Tree<T[keyof T]>>;
    let currentSeed = seed;

    // Generate all property values
    for (const key of keys) {
      const [seed1, seed2] = currentSeed.split();
      const gen = schema[key];
      const tree = gen(size, seed1);
      values[key] = tree.value;
      valueTrees[key] = tree;
      currentSeed = seed2;
    }

    const result = values as T;
    const builder = shrinkBuilder<T>();

    // Shrink individual properties using helper pattern
    for (const key of keys) {
      const valueTree = valueTrees[key];
      if (valueTree.hasShrinks()) {
        for (const shrunkValue of valueTree.shrinks()) {
          const shrunkObject = {
            ...result,
            [key]: shrunkValue,
          };
          builder.add(shrunkObject);
        }
      }
    }

    return builder.build(result);
  });
}

/**
 * Generate fixed-length heterogeneous tuples.
 */
export function tuple<T extends readonly unknown[]>(
  ...generators: { [K in keyof T]: GeneratorFn<T[K]> }
): GeneratorFn<T> {
  return create((size, seed) => {
    if (generators.length === 0) {
      return Tree.singleton([] as unknown as T);
    }

    const elements: unknown[] = [];
    const elementTrees: Tree<unknown>[] = [];
    let currentSeed = seed;

    // Generate all tuple elements
    for (let i = 0; i < generators.length; i++) {
      const [seed1, seed2] = currentSeed.split();
      const gen = generators[i];
      const tree = gen(size, seed1);
      elements.push(tree.value);
      elementTrees.push(tree);
      currentSeed = seed2;
    }

    const result = elements as unknown as T;
    const builder = shrinkBuilder<T>();

    // Shrink individual elements
    for (let i = 0; i < generators.length; i++) {
      const elementTree = elementTrees[i];
      if (elementTree.hasShrinks()) {
        for (const shrunkElement of elementTree.shrinks()) {
          const shrunkTuple = [
            ...elements.slice(0, i),
            shrunkElement,
            ...elements.slice(i + 1),
          ] as unknown as T;
          builder.add(shrunkTuple);
        }
      }
    }

    return builder.build(result);
  });
}
