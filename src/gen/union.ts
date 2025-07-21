import { Gen } from '../gen.js';
import { Tree } from '../data/tree.js';

/**
 * Union and optional type generators for handling nullable and union types.
 */

/**
 * Generate optional values (T | undefined).
 * Generates undefined with a probability based on size.
 */
export function optional<T>(gen: Gen<T>): Gen<T | undefined> {
  return Gen.create((size, seed) => {
    // Probability of undefined decreases with size
    // At size 0: 50% undefined, at size 100: ~9% undefined
    const undefinedProbability = Math.max(0.05, 0.5 - size.get() * 0.004);

    const [shouldBeUndefined, newSeed] = seed.nextFloat();

    if (shouldBeUndefined < undefinedProbability) {
      // Generate undefined with shrink to defined value
      const shrinks: Tree<T | undefined>[] = [];
      const definedTree = gen.generate(size, newSeed);
      shrinks.push(Tree.singleton(definedTree.value));

      return Tree.withChildren(undefined, shrinks);
    } else {
      // Generate defined value with shrink to undefined
      const tree = gen.generate(size, newSeed);
      const shrinks: Tree<T | undefined>[] = [Tree.singleton(undefined)];

      // Include shrinks from the underlying generator
      if (tree.hasShrinks()) {
        for (const shrunkValue of tree.shrinks()) {
          shrinks.push(Tree.singleton(shrunkValue));
        }
      }

      return Tree.withChildren(tree.value, shrinks);
    }
  });
}

/**
 * Generate nullable values (T | null).
 * Similar to optional but uses null instead of undefined.
 */
export function nullable<T>(gen: Gen<T>): Gen<T | null> {
  return Gen.create((size, seed) => {
    // Probability of null decreases with size
    const nullProbability = Math.max(0.05, 0.5 - size.get() * 0.004);

    const [shouldBeNull, newSeed] = seed.nextFloat();

    if (shouldBeNull < nullProbability) {
      // Generate null with shrink to defined value
      const shrinks: Tree<T | null>[] = [];
      const definedTree = gen.generate(size, newSeed);
      shrinks.push(Tree.singleton(definedTree.value));

      return Tree.withChildren(null, shrinks);
    } else {
      // Generate defined value with shrink to null
      const tree = gen.generate(size, newSeed);
      const shrinks: Tree<T | null>[] = [Tree.singleton(null)];

      // Include shrinks from the underlying generator
      if (tree.hasShrinks()) {
        for (const shrunkValue of tree.shrinks()) {
          shrinks.push(Tree.singleton(shrunkValue));
        }
      }

      return Tree.withChildren(tree.value, shrinks);
    }
  });
}

/**
 * Generate union types from multiple generators.
 * Chooses between generators with equal probability.
 */
export function union<T extends readonly unknown[]>(
  ...generators: { [K in keyof T]: Gen<T[K]> }
): Gen<T[number]> {
  if (generators.length === 0) {
    throw new Error('union requires at least one generator');
  }

  return Gen.create((size, seed) => {
    const [index, newSeed] = seed.nextBounded(generators.length);
    const selectedGen = generators[index];
    const tree = selectedGen.generate(size, newSeed);

    const shrinks: Tree<T[number]>[] = [];

    // Include shrinks from the selected generator
    if (tree.hasShrinks()) {
      for (const shrunkValue of tree.shrinks()) {
        shrinks.push(Tree.singleton(shrunkValue));
      }
    }

    // Try shrinking to other union alternatives
    for (let i = 0; i < generators.length; i++) {
      if (i !== index) {
        const altGen = generators[i];
        const altTree = altGen.generate(size, newSeed);
        shrinks.push(Tree.singleton(altTree.value));
      }
    }

    return Tree.withChildren(tree.value, shrinks);
  });
}

/**
 * Generate discriminated unions based on a discriminator field.
 * Uses a more precise API where discriminator values are the keys.
 */
export function discriminatedUnion<
  K extends string,
  T extends Record<string, unknown>,
>(
  discriminatorKey: K,
  variants: Record<string, Gen<T & Record<K, string>>>
): Gen<T & Record<K, string>> {
  const discriminatorValues = Object.keys(variants);

  if (discriminatorValues.length === 0) {
    throw new Error('discriminatedUnion requires at least one variant');
  }

  // Runtime validation: check that generators produce correct discriminator values
  return Gen.create((size, seed) => {
    const [index, newSeed] = seed.nextBounded(discriminatorValues.length);
    const expectedDiscriminator = discriminatorValues[index];
    const selectedGen = variants[expectedDiscriminator];

    const tree = selectedGen.generate(size, newSeed);
    const generatedValue = tree.value;

    // Validate discriminator field exists and matches
    if (typeof generatedValue === 'object' && generatedValue !== null) {
      const actualDiscriminator = (generatedValue as any)[discriminatorKey];

      if (actualDiscriminator === undefined) {
        throw new Error(
          `Generated object missing discriminator field '${discriminatorKey}'. ` +
            `Expected field '${discriminatorKey}' to be '${expectedDiscriminator}'.`
        );
      }

      if (actualDiscriminator !== expectedDiscriminator) {
        throw new Error(
          `Discriminator value mismatch. Expected '${discriminatorKey}: ${expectedDiscriminator}' ` +
            `but generated object has '${discriminatorKey}: ${actualDiscriminator}'.`
        );
      }
    } else {
      throw new Error(
        `discriminatedUnion can only generate objects, but got ${typeof generatedValue}`
      );
    }

    const shrinks: Tree<T & Record<K, string>>[] = [];

    // Include shrinks from the selected generator (with validation)
    if (tree.hasShrinks()) {
      for (const shrunkValue of tree.shrinks()) {
        // Validate shrunk values too
        if (
          typeof shrunkValue === 'object' &&
          shrunkValue !== null &&
          (shrunkValue as any)[discriminatorKey] === expectedDiscriminator
        ) {
          shrinks.push(Tree.singleton(shrunkValue));
        }
      }
    }

    // Try shrinking to other discriminated union variants
    for (const otherDiscriminator of discriminatorValues) {
      if (otherDiscriminator !== expectedDiscriminator) {
        const altGen = variants[otherDiscriminator];
        const altTree = altGen.generate(size, newSeed);
        shrinks.push(Tree.singleton(altTree.value));
      }
    }

    return Tree.withChildren(tree.value, shrinks);
  });
}

/**
 * Generate union types with weighted probabilities.
 * Each generator has an associated weight determining selection probability.
 */
export function weightedUnion<T>(choices: Array<[number, Gen<T>]>): Gen<T> {
  if (choices.length === 0) {
    throw new Error('weightedUnion requires at least one choice');
  }

  const totalWeight = choices.reduce((sum, [weight]) => sum + weight, 0);
  if (totalWeight <= 0) {
    throw new Error('weightedUnion requires positive total weight');
  }

  return Gen.create((size, seed) => {
    const [random, newSeed] = seed.nextBounded(totalWeight);
    let currentWeight = 0;
    let selectedIndex = 0;

    for (let i = 0; i < choices.length; i++) {
      const [weight] = choices[i];
      currentWeight += weight;
      if (random < currentWeight) {
        selectedIndex = i;
        break;
      }
    }

    const [, selectedGen] = choices[selectedIndex];
    const tree = selectedGen.generate(size, newSeed);

    const shrinks: Tree<T>[] = [];

    // Include shrinks from the selected generator
    if (tree.hasShrinks()) {
      for (const shrunkValue of tree.shrinks()) {
        shrinks.push(Tree.singleton(shrunkValue));
      }
    }

    // Try shrinking to other weighted alternatives
    for (let i = 0; i < choices.length; i++) {
      if (i !== selectedIndex) {
        const [, altGen] = choices[i];
        const altTree = altGen.generate(size, newSeed);
        shrinks.push(Tree.singleton(altTree.value));
      }
    }

    return Tree.withChildren(tree.value, shrinks);
  });
}
