import { GeneratorFn, create, sizeBiasedProbability } from './core.js';
import { shrinkBuilder } from './shrink.js';

/**
 * Union and optional type generators for handling nullable and union types.
 */

/**
 * Generate optional values (T | undefined).
 * Generates undefined with a probability based on size.
 */
export function optional<T>(gen: GeneratorFn<T>): GeneratorFn<T | undefined> {
  return create((size, seed) => {
    const undefinedProbability = sizeBiasedProbability(size);

    const [shouldBeUndefined, newSeed] = seed.nextFloat();

    if (shouldBeUndefined < undefinedProbability) {
      // Generate undefined with shrink to defined value
      const definedTree = gen(size, newSeed);
      return shrinkBuilder<T | undefined>()
        .add(definedTree.value)
        .build(undefined);
    } else {
      // Generate defined value with shrink to undefined
      const tree = gen(size, newSeed);
      const builder = shrinkBuilder<T | undefined>().add(undefined);

      // Include shrinks from the underlying generator
      builder.addFromTree(tree);

      return builder.build(tree.value);
    }
  });
}

/**
 * Generate nullable values (T | null).
 * Similar to optional but uses null instead of undefined.
 */
export function nullable<T>(gen: GeneratorFn<T>): GeneratorFn<T | null> {
  return create((size, seed) => {
    const nullProbability = sizeBiasedProbability(size);

    const [shouldBeNull, newSeed] = seed.nextFloat();

    if (shouldBeNull < nullProbability) {
      // Generate null with shrink to defined value
      const definedTree = gen(size, newSeed);
      return shrinkBuilder<T | null>().add(definedTree.value).build(null);
    } else {
      // Generate defined value with shrink to null
      const tree = gen(size, newSeed);
      const builder = shrinkBuilder<T | null>().add(null);

      // Include shrinks from the underlying generator
      builder.addFromTree(tree);

      return builder.build(tree.value);
    }
  });
}

/**
 * Generate union types from multiple generators.
 * Chooses between generators with equal probability.
 */
export function union<T extends readonly unknown[]>(
  ...generators: { [K in keyof T]: GeneratorFn<T[K]> }
): GeneratorFn<T[number]> {
  if (generators.length === 0) {
    throw new Error('union requires at least one generator');
  }

  return create((size, seed) => {
    const [index, newSeed] = seed.nextBounded(generators.length);
    const selectedGen = generators[index];
    const tree = selectedGen(size, newSeed);
    const builder = shrinkBuilder<T[number]>();

    // Include shrinks from the selected generator
    builder.addFromTree(tree);

    // Try shrinking to other union alternatives
    for (let i = 0; i < generators.length; i++) {
      if (i !== index) {
        const altGen = generators[i];
        const altTree = altGen(size, newSeed);
        builder.add(altTree.value);
      }
    }

    return builder.build(tree.value);
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
  variants: Record<string, GeneratorFn<T & Record<K, string>>>
): GeneratorFn<T & Record<K, string>> {
  const discriminatorValues = Object.keys(variants);

  if (discriminatorValues.length === 0) {
    throw new Error('discriminatedUnion requires at least one variant');
  }

  // Runtime validation: check that generators produce correct discriminator values
  return create((size, seed) => {
    const [index, newSeed] = seed.nextBounded(discriminatorValues.length);
    const expectedDiscriminator = discriminatorValues[index];
    const selectedGen = variants[expectedDiscriminator];

    const tree = selectedGen(size, newSeed);
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

    const builder = shrinkBuilder<T & Record<K, string>>();

    // Include shrinks from the selected generator (with validation)
    if (tree.hasShrinks()) {
      for (const shrunkValue of tree.shrinks()) {
        // Validate shrunk values too
        if (
          typeof shrunkValue === 'object' &&
          shrunkValue !== null &&
          (shrunkValue as any)[discriminatorKey] === expectedDiscriminator
        ) {
          builder.add(shrunkValue);
        }
      }
    }

    // Try shrinking to other discriminated union variants
    for (const otherDiscriminator of discriminatorValues) {
      if (otherDiscriminator !== expectedDiscriminator) {
        const altGen = variants[otherDiscriminator];
        const altTree = altGen(size, newSeed);
        builder.add(altTree.value);
      }
    }

    return builder.build(tree.value);
  });
}

/**
 * Generate union types with weighted probabilities.
 * Each generator has an associated weight determining selection probability.
 */
export function weightedUnion<T>(
  choices: Array<[number, GeneratorFn<T>]>
): GeneratorFn<T> {
  if (choices.length === 0) {
    throw new Error('weightedUnion requires at least one choice');
  }

  const totalWeight = choices.reduce((sum, [weight]) => sum + weight, 0);
  if (totalWeight <= 0) {
    throw new Error('weightedUnion requires positive total weight');
  }

  return create((size, seed) => {
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
    const tree = selectedGen(size, newSeed);
    const builder = shrinkBuilder<T>();

    // Include shrinks from the selected generator
    builder.addFromTree(tree);

    // Try shrinking to other weighted alternatives
    for (let i = 0; i < choices.length; i++) {
      if (i !== selectedIndex) {
        const [, altGen] = choices[i];
        const altTree = altGen(size, newSeed);
        builder.add(altTree.value);
      }
    }

    return builder.build(tree.value);
  });
}
