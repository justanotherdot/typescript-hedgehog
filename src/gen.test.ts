import { describe, test, expect } from 'vitest';
import { Gen } from './gen';
import { Tree } from './data/tree';
import { Size } from './data/size';
import { Seed } from './data/seed';

describe('Gen', () => {
  const size = Size.of(10);
  const seed = Seed.fromNumber(42);

  test('creates generator with function', () => {
    const gen = Gen.create((_size, _seed) => Tree.singleton(42));
    const tree = gen.generate(size, seed);
    expect(tree.value).toBe(42);
  });

  test('constant generator always returns same value', () => {
    const gen = Gen.constant('hello');
    const tree1 = gen.generate(size, seed);
    const tree2 = gen.generate(Size.of(100), Seed.fromNumber(999));

    expect(tree1.value).toBe('hello');
    expect(tree2.value).toBe('hello');
  });

  test('maps generator values', () => {
    const numGen = Gen.constant(42);
    const stringGen = numGen.map((n) => n.toString());

    const tree = stringGen.generate(size, seed);
    expect(tree.value).toBe('42');
    expect(typeof tree.value).toBe('string');
  });

  test('filters generator values', () => {
    // Generator that produces numbers 0-9
    const numGen = Gen.create((size, seed) => {
      const [value] = seed.nextBounded(10);
      return Tree.singleton(value);
    });

    const evenGen = numGen.filter((n) => n % 2 === 0);

    // Test multiple generations to ensure all are even
    let currentSeed = seed;
    for (let i = 0; i < 10; i++) {
      const [leftSeed, rightSeed] = currentSeed.split();
      const tree = evenGen.generate(size, leftSeed);
      expect(tree.value % 2).toBe(0);
      currentSeed = rightSeed;
    }
  });

  test('filter gives up after too many attempts', () => {
    const alwaysOddGen = Gen.create(() => Tree.singleton(1));
    const evenGen = alwaysOddGen.filter((n) => n % 2 === 0);

    expect(() => evenGen.generate(size, seed)).toThrow(
      /Failed to generate value satisfying predicate/
    );
  });

  test('binds generators', () => {
    const baseGen = Gen.constant(5);
    const boundGen = baseGen.bind((n) => Gen.constant(n * 2));

    const tree = boundGen.generate(size, seed);
    expect(tree.value).toBe(10);
  });

  test('oneOf chooses from generators', () => {
    const gen1 = Gen.constant('a');
    const gen2 = Gen.constant('b');
    const gen3 = Gen.constant('c');

    const choiceGen = Gen.oneOf([gen1, gen2, gen3]);

    // Test multiple generations to see variety
    const values = new Set<string>();
    let currentSeed = seed;

    for (let i = 0; i < 20; i++) {
      const [leftSeed, rightSeed] = currentSeed.split();
      const tree = choiceGen.generate(size, leftSeed);
      values.add(tree.value);
      currentSeed = rightSeed;
    }

    expect(values.size).toBeGreaterThan(1); // Should see variety
    expect([...values].every((v) => ['a', 'b', 'c'].includes(v))).toBe(true);
  });

  test('oneOf throws with empty array', () => {
    expect(() => Gen.oneOf([])).toThrow(
      'oneOf requires at least one generator'
    );
  });

  test('frequency chooses with weights', () => {
    const heavyChoice = Gen.constant('heavy');
    const lightChoice = Gen.constant('light');

    const weightedGen = Gen.frequency([
      [90, heavyChoice],
      [10, lightChoice],
    ]);

    // Test many generations to check distribution
    const counts = new Map<string, number>();
    let currentSeed = seed;

    for (let i = 0; i < 1000; i++) {
      const [leftSeed, rightSeed] = currentSeed.split();
      const tree = weightedGen.generate(size, leftSeed);
      counts.set(tree.value, (counts.get(tree.value) || 0) + 1);
      currentSeed = rightSeed;
    }

    const heavyCount = counts.get('heavy') || 0;
    const lightCount = counts.get('light') || 0;

    // Heavy should be much more common (rough check)
    expect(heavyCount).toBeGreaterThan(lightCount * 2);
  });

  test('frequency throws with empty choices', () => {
    expect(() => Gen.frequency([])).toThrow(
      'frequency requires at least one choice'
    );
  });

  test('frequency throws with zero total weight', () => {
    expect(() => Gen.frequency([[0, Gen.constant(1)]])).toThrow(
      'frequency requires positive total weight'
    );
  });

  test('sized generator accesses size parameter', () => {
    const sizedGen = Gen.sized((size) => Gen.constant(size.get()));

    const smallTree = sizedGen.generate(Size.of(5), seed);
    const largeTree = sizedGen.generate(Size.of(50), seed);

    expect(smallTree.value).toBe(5);
    expect(largeTree.value).toBe(50);
  });

  test('scale modifies size parameter', () => {
    const sizeCapturingGen = Gen.sized((size) => Gen.constant(size.get()));
    const scaledGen = sizeCapturingGen.scale((size) => size.scale(2));

    const tree = scaledGen.generate(Size.of(10), seed);
    expect(tree.value).toBe(20); // 10 * 2
  });

  test('array generator produces arrays', () => {
    const elemGen = Gen.constant(42);
    const arrayGen = Gen.array(elemGen);

    const tree = arrayGen.generate(size, seed);
    expect(Array.isArray(tree.value)).toBe(true);
    expect(tree.value.length).toBeLessThanOrEqual(size.get());
    expect(tree.value.every((x) => x === 42)).toBe(true);
  });

  test('array generator produces shrinks', () => {
    const elemGen = Gen.constant(1);
    const arrayGen = Gen.array(elemGen);

    const tree = arrayGen.generate(Size.of(5), seed);

    if (tree.value.length > 0) {
      expect(tree.hasShrinks()).toBe(true);
      const shrinks = tree.shrinks();

      // Should include empty array
      expect(shrinks.some((arr) => arr.length === 0)).toBe(true);

      // Should include shorter arrays
      const shorterShrinks = shrinks.filter(
        (arr) => arr.length < tree.value.length
      );
      expect(shorterShrinks.length).toBeGreaterThan(0);
    }
  });

  test('arrayOfLength produces exact length', () => {
    const elemGen = Gen.constant('x');
    const arrayGen = Gen.arrayOfLength(elemGen, 7);

    const tree = arrayGen.generate(size, seed);
    expect(tree.value).toHaveLength(7);
    expect(tree.value.every((x) => x === 'x')).toBe(true);
  });

  test('arrayOfLength with zero length', () => {
    const elemGen = Gen.constant(1);
    const arrayGen = Gen.arrayOfLength(elemGen, 0);

    const tree = arrayGen.generate(size, seed);
    expect(tree.value).toEqual([]);
    expect(tree.hasShrinks()).toBe(false);
  });

  test('generators are deterministic with same seed', () => {
    const gen = Gen.oneOf([Gen.constant(1), Gen.constant(2), Gen.constant(3)]);

    const tree1 = gen.generate(size, seed);
    const tree2 = gen.generate(size, seed);

    expect(tree1.value).toBe(tree2.value);
  });

  test('generators produce different values with different seeds', () => {
    const gen = Gen.oneOf([Gen.constant(1), Gen.constant(2), Gen.constant(3)]);

    const values = new Set<number>();

    for (let i = 0; i < 20; i++) {
      const testSeed = Seed.fromNumber(i);
      const tree = gen.generate(size, testSeed);
      values.add(tree.value);
    }

    expect(values.size).toBeGreaterThan(1);
  });

  test('handles empty generator arrays gracefully', () => {
    expect(() => Gen.oneOf([])).toThrow(
      'oneOf requires at least one generator'
    );
    expect(() => Gen.frequency([])).toThrow(
      'frequency requires at least one choice'
    );
  });

  test('handles zero total weight in frequency', () => {
    expect(() =>
      Gen.frequency([
        [0, Gen.constant(1)],
        [0, Gen.constant(2)],
      ])
    ).toThrow('frequency requires positive total weight');
  });

  test('filter fails gracefully with impossible predicates', () => {
    const impossibleGen = Gen.constant(5).filter((n) => n > 100);

    expect(() => {
      impossibleGen.generate(size, seed);
    }).toThrow(/Failed to generate value satisfying predicate/);
  });

  test('handles zero-length array generation', () => {
    const emptyArrayGen = Gen.arrayOfLength(Gen.constant(42), 0);
    const tree = emptyArrayGen.generate(size, seed);

    expect(tree.value).toEqual([]);
    expect(tree.hasShrinks()).toBe(false);
  });

  test('nested generator binding depth', () => {
    // Create moderately nested bind chain to avoid performance issues
    let nestedGen: Gen<number> = Gen.constant(1);
    for (let i = 0; i < 10; i++) {
      nestedGen = nestedGen.bind((n) => Gen.constant(n + 1));
    }

    const tree = nestedGen.generate(size, seed);
    expect(tree.value).toBe(11); // 1 + 10 increments
  });

  test('frequency with very skewed weights', () => {
    const heavyGen = Gen.constant('heavy');
    const lightGen = Gen.constant('light');

    // Extremely skewed distribution
    const skewedGen = Gen.frequency([
      [99999, heavyGen],
      [1, lightGen],
    ]);

    // Should still work and heavily favor 'heavy'
    const values = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const tree = skewedGen.generate(Size.of(10), Seed.fromNumber(i));
      values.add(tree.value);
    }

    expect(values.has('heavy')).toBe(true);
    // 'light' might not appear in small sample due to low probability
  });
});
