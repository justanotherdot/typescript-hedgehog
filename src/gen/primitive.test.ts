import { describe, test, expect } from 'vitest';
import { Gen, Ints, Strings } from '../gen.js';
import { Range, Size } from '../data/size.js';
import { Seed } from '../data/seed.js';

describe('primitive generators', () => {
  const size = Size.of(10);
  const seed = Seed.fromNumber(42);

  describe('bool', () => {
    test('generates boolean values', () => {
      const gen = Gen.bool();
      const tree = gen.generate(size, seed);

      expect(typeof tree.value).toBe('boolean');
      expect(tree.hasShrinks()).toBe(true);
      expect(tree.shrinks()).toHaveLength(1);
      expect(tree.shrinks()[0]).toBe(!tree.value);
    });
  });

  describe('int', () => {
    test('generates integers within range', () => {
      const range = Range.uniform(1, 10);
      const gen = Gen.int(range);
      const tree = gen.generate(size, seed);

      expect(Number.isInteger(tree.value)).toBe(true);
      expect(tree.value).toBeGreaterThanOrEqual(1);
      expect(tree.value).toBeLessThanOrEqual(10);
    });

    test('generates shrinks towards origin', () => {
      const range = Range.uniform(0, 100).withOrigin(0);
      const gen = Gen.int(range);
      const tree = gen.generate(size, seed);

      if (tree.value !== 0) {
        expect(tree.hasShrinks()).toBe(true);
        // All shrinks should be closer to origin than original value
        const shrinks = tree.shrinks();
        for (const shrink of shrinks) {
          expect(Math.abs(shrink)).toBeLessThanOrEqual(Math.abs(tree.value));
        }
      }
    });

    test('respects range bounds in shrinks', () => {
      const range = Range.uniform(5, 15).withOrigin(10);
      const gen = Gen.int(range);
      const tree = gen.generate(size, seed);

      const allValues = [tree.value, ...tree.shrinks()];
      for (const value of allValues) {
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThanOrEqual(15);
      }
    });
  });

  describe('string', () => {
    test('generates strings within size limit', () => {
      const gen = Gen.string();
      const tree = gen.generate(size, seed);

      expect(typeof tree.value).toBe('string');
      expect(tree.value.length).toBeLessThanOrEqual(size.get());
    });

    test('generates shrinks by reducing length', () => {
      const gen = Gen.string();
      const tree = gen.generate(Size.of(5), seed);

      if (tree.value.length > 0) {
        expect(tree.hasShrinks()).toBe(true);
        const shrinks = tree.shrinks();

        // Should include empty string
        expect(shrinks).toContain('');

        // Should include shorter strings
        const shorterShrinks = shrinks.filter(
          (s) => s.length < tree.value.length
        );
        expect(shorterShrinks.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Ints', () => {
    test('small generates small integers', () => {
      const gen = Ints.small();
      const tree = gen.generate(size, seed);

      expect(tree.value).toBeGreaterThanOrEqual(0);
      expect(tree.value).toBeLessThanOrEqual(100);
    });

    test('range generates within specified bounds', () => {
      const gen = Ints.range(10, 20);
      const tree = gen.generate(size, seed);

      expect(tree.value).toBeGreaterThanOrEqual(10);
      expect(tree.value).toBeLessThanOrEqual(20);
    });

    test('handles extreme integer ranges at JavaScript limits', () => {
      const maxRange = Range.uniform(
        Number.MAX_SAFE_INTEGER - 1,
        Number.MAX_SAFE_INTEGER
      );
      const minRange = Range.uniform(
        Number.MIN_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER + 1
      );

      const maxGen = Gen.int(maxRange);
      const minGen = Gen.int(minRange);

      const maxTree = maxGen.generate(Size.of(10), Seed.fromNumber(42));
      const minTree = minGen.generate(Size.of(10), Seed.fromNumber(42));

      expect(maxTree.value).toBeGreaterThanOrEqual(Number.MAX_SAFE_INTEGER - 1);
      expect(maxTree.value).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);

      expect(minTree.value).toBeGreaterThanOrEqual(Number.MIN_SAFE_INTEGER);
      expect(minTree.value).toBeLessThanOrEqual(Number.MIN_SAFE_INTEGER + 1);
    });
  });

  describe('Strings', () => {
    test('ascii generates ASCII strings', () => {
      const gen = Strings.ascii();
      const tree = gen.generate(size, seed);

      expect(typeof tree.value).toBe('string');
      // Check all characters are printable ASCII
      for (const char of tree.value) {
        const code = char.charCodeAt(0);
        expect(code).toBeGreaterThanOrEqual(32);
        expect(code).toBeLessThanOrEqual(126);
      }
    });

    test('alpha generates alphabetic strings', () => {
      const gen = Strings.alpha();
      const tree = gen.generate(size, seed);

      expect(typeof tree.value).toBe('string');
      // Check all characters are alphabetic
      expect(tree.value).toMatch(/^[a-zA-Z]*$/);
    });

    test('handles string generation edge cases', () => {
      // Empty string generation
      const emptyStringGen = Gen.stringOfLength(0);
      const emptyTree = emptyStringGen.generate(
        Size.of(10),
        Seed.fromNumber(42)
      );
      expect(emptyTree.value).toBe('');

      // Reasonably long string for testing
      const longStringGen = Gen.stringOfLength(100);
      const longTree = longStringGen.generate(Size.of(10), Seed.fromNumber(42));
      expect(longTree.value.length).toBe(100);
    });

    test('asciiOfLength generates exact length', () => {
      const gen = Strings.asciiOfLength(5);
      const tree = gen.generate(size, seed);

      expect(tree.value).toHaveLength(5);
    });
  });

  describe('number', () => {
    test('generates numbers within range', () => {
      const gen = Gen.number({ min: -10, max: 10 });
      const tree = gen.generate(size, seed);

      expect(typeof tree.value).toBe('number');
      expect(tree.value).toBeGreaterThanOrEqual(-10);
      expect(tree.value).toBeLessThanOrEqual(10);
      expect(Number.isFinite(tree.value)).toBe(true);
    });

    test('respects multipleOf constraint', () => {
      const gen = Gen.number({ min: 0, max: 100, multipleOf: 5 });
      const samples = gen.samples(50);

      samples.forEach((value) => {
        expect(value % 5).toBeCloseTo(0, 10);
      });
    });

    test('generates infinite values when finite=false', () => {
      const gen = Gen.number({ finite: false });
      const samples = gen.samples(100);

      const hasInfinite = samples.some((v) => !Number.isFinite(v));
      const hasFinite = samples.some((v) => Number.isFinite(v));

      expect(hasInfinite).toBe(true);
      expect(hasFinite).toBe(true);
    });

    test('shrinks towards zero when in range', () => {
      const gen = Gen.number({ min: -100, max: 100 });
      const tree = gen.generate(size, seed);

      if (tree.value !== 0) {
        expect(tree.hasShrinks()).toBe(true);
      }
    });
  });

  describe('date', () => {
    test('generates dates within range', () => {
      const minDate = new Date('2020-01-01');
      const maxDate = new Date('2023-12-31');
      const gen = Gen.date({ min: minDate, max: maxDate });
      const tree = gen.generate(size, seed);

      expect(tree.value).toBeInstanceOf(Date);
      expect(tree.value.getTime()).toBeGreaterThanOrEqual(minDate.getTime());
      expect(tree.value.getTime()).toBeLessThanOrEqual(maxDate.getTime());
    });

    test('generates different dates', () => {
      const gen = Gen.date();
      const samples = gen.samples(20);

      const uniqueTimes = new Set(samples.map((d) => d.getTime()));
      expect(uniqueTimes.size).toBeGreaterThan(1);
    });

    test('shrinks dates towards minimum', () => {
      const minDate = new Date('2020-01-01');
      const maxDate = new Date('2023-12-31');
      const gen = Gen.date({ min: minDate, max: maxDate });
      const tree = gen.generate(size, seed);

      if (tree.value.getTime() !== minDate.getTime()) {
        expect(tree.hasShrinks()).toBe(true);
      }
    });
  });

  describe('enumValue', () => {
    test('generates values from the enum array', () => {
      const values = ['red', 'green', 'blue'] as const;
      const gen = Gen.enum(values);
      const samples = gen.samples(100);

      samples.forEach((value) => {
        expect(values).toContain(value);
      });

      // Should generate all values over many samples
      const uniqueValues = new Set(samples);
      expect(uniqueValues.size).toBe(3);
    });

    test('shrinks towards first element', () => {
      const values = ['zebra', 'apple', 'banana'] as const;
      const gen = Gen.enum(values);

      // Mock seed to return index 2 (banana)
      const mockSeed = { nextBounded: () => [2, seed] } as any;
      const tree = gen.generate(size, mockSeed);

      expect(tree.value).toBe('banana');

      const shrinks = tree.shrinks();
      expect(shrinks).toHaveLength(1);
      expect(shrinks[0]).toBe('zebra');
    });

    test('handles single element arrays', () => {
      const values = ['only'] as const;
      const gen = Gen.enum(values);
      const tree = gen.generate(size, seed);

      expect(tree.value).toBe('only');
      expect(tree.shrinks()).toHaveLength(0);
    });
  });

  describe('literal', () => {
    test('always generates the same value', () => {
      const gen = Gen.literal('constant');
      const samples = gen.samples(20);

      samples.forEach((value) => {
        expect(value).toBe('constant');
      });
    });

    test('works with different literal types', () => {
      const stringGen = Gen.literal('text');
      const numberGen = Gen.literal(42);
      const boolGen = Gen.literal(true);

      expect(stringGen.sample()).toBe('text');
      expect(numberGen.sample()).toBe(42);
      expect(boolGen.sample()).toBe(true);
    });

    test('has no shrinks for literals', () => {
      const gen = Gen.literal('constant');
      const tree = gen.generate(size, seed);

      expect(tree.value).toBe('constant');
      expect(tree.shrinks()).toHaveLength(0);
    });
  });
});
