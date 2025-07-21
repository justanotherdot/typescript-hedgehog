import { describe, it, expect } from 'vitest';
import { Gen } from '../gen.js';
import {
  optional,
  nullable,
  union,
  discriminatedUnion,
  weightedUnion,
} from './union.js';
import { bool, int, string } from './primitive.js';
import { object } from './collection.js';
import { Range } from '../data/size.js';
import { Size } from '../data/size.js';
import { Seed } from '../seed/bigint.js';

describe('Union generators', () => {
  const seed = Seed.fromNumber(42);
  const size = Size.of(10);

  describe('optional()', () => {
    it('generates both undefined and defined values', () => {
      const gen = optional(int(Range.uniform(1, 100)));
      const values: Array<number | undefined> = [];

      // Generate multiple values to test both cases
      let currentSeed = seed;
      for (let i = 0; i < 20; i++) {
        const tree = gen.generate(size, currentSeed);
        values.push(tree.value);
        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
      }

      const definedValues = values.filter((v) => v !== undefined);
      const undefinedValues = values.filter((v) => v === undefined);

      expect(definedValues.length).toBeGreaterThan(0);
      expect(undefinedValues.length).toBeGreaterThan(0);
      expect(definedValues.every((v) => typeof v === 'number')).toBe(true);
    });

    it('generates proper shrinks for undefined values', () => {
      const gen = optional(int(Range.uniform(10, 20)));

      // Try multiple times to get an undefined value
      let currentSeed = seed;
      let undefinedTree = null;

      for (let i = 0; i < 50; i++) {
        const tree = gen.generate(Size.of(0), currentSeed); // Size 0 increases undefined probability
        if (tree.value === undefined) {
          undefinedTree = tree;
          break;
        }
        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
      }

      if (undefinedTree) {
        expect(undefinedTree.hasShrinks()).toBe(true);
        const shrinks = undefinedTree.shrinks();
        expect(shrinks.some((v) => typeof v === 'number')).toBe(true);
      }
    });

    it('generates proper shrinks for defined values', () => {
      const gen = optional(int(Range.uniform(10, 20)));

      // Try multiple times to get a defined value
      let currentSeed = seed;
      let definedTree = null;

      for (let i = 0; i < 50; i++) {
        const tree = gen.generate(Size.of(50), currentSeed); // Higher size reduces undefined probability
        if (tree.value !== undefined) {
          definedTree = tree;
          break;
        }
        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
      }

      if (definedTree) {
        expect(definedTree.hasShrinks()).toBe(true);
        const shrinks = definedTree.shrinks();
        expect(shrinks).toContain(undefined);
      }
    });

    it('works with Gen.optional() static method', () => {
      const gen = Gen.optional(string());
      const tree = gen.generate(size, seed);

      expect(tree.value === undefined || typeof tree.value === 'string').toBe(
        true
      );
    });
  });

  describe('nullable()', () => {
    it('generates both null and defined values', () => {
      const gen = nullable(bool());
      const values: Array<boolean | null> = [];

      // Generate multiple values to test both cases
      let currentSeed = seed;
      for (let i = 0; i < 20; i++) {
        const tree = gen.generate(size, currentSeed);
        values.push(tree.value);
        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
      }

      const definedValues = values.filter((v) => v !== null);
      const nullValues = values.filter((v) => v === null);

      expect(definedValues.length).toBeGreaterThan(0);
      expect(nullValues.length).toBeGreaterThan(0);
      expect(definedValues.every((v) => typeof v === 'boolean')).toBe(true);
    });

    it('generates proper shrinks for null values', () => {
      const gen = nullable(int(Range.uniform(10, 20)));

      // Try multiple times to get a null value
      let currentSeed = seed;
      let nullTree = null;

      for (let i = 0; i < 50; i++) {
        const tree = gen.generate(Size.of(0), currentSeed);
        if (tree.value === null) {
          nullTree = tree;
          break;
        }
        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
      }

      if (nullTree) {
        expect(nullTree.hasShrinks()).toBe(true);
        const shrinks = nullTree.shrinks();
        expect(shrinks.some((v) => typeof v === 'number')).toBe(true);
      }
    });

    it('works with Gen.nullable() static method', () => {
      const gen = Gen.nullable(int(Range.uniform(1, 10)));
      const tree = gen.generate(size, seed);

      expect(tree.value === null || typeof tree.value === 'number').toBe(true);
    });
  });

  describe('union()', () => {
    it('generates values from all provided generators', () => {
      const gen = union(int(Range.uniform(1, 10)), string(), bool());

      const values: Array<number | string | boolean> = [];
      let currentSeed = seed;

      // Generate multiple values to test all types
      for (let i = 0; i < 30; i++) {
        const tree = gen.generate(size, currentSeed);
        values.push(tree.value);
        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
      }

      const numbers = values.filter((v) => typeof v === 'number');
      const strings = values.filter((v) => typeof v === 'string');
      const booleans = values.filter((v) => typeof v === 'boolean');

      expect(numbers.length).toBeGreaterThan(0);
      expect(strings.length).toBeGreaterThan(0);
      expect(booleans.length).toBeGreaterThan(0);
    });

    it('generates shrinks including other union alternatives', () => {
      const gen = union(int(Range.uniform(50, 100)), Gen.constant('test'));

      const tree = gen.generate(size, seed);
      expect(tree.hasShrinks()).toBe(true);

      const shrinks = tree.shrinks();
      if (typeof tree.value === 'number') {
        expect(shrinks).toContain('test');
      } else {
        expect(shrinks.some((v) => typeof v === 'number')).toBe(true);
      }
    });

    it('throws error for empty union', () => {
      expect(() => union()).toThrow('union requires at least one generator');
    });

    it('works with Gen.union() static method', () => {
      const gen = Gen.union(bool(), int(Range.uniform(1, 5)));
      const tree = gen.generate(size, seed);

      expect(
        typeof tree.value === 'boolean' || typeof tree.value === 'number'
      ).toBe(true);
    });
  });

  describe('discriminatedUnion()', () => {
    it('generates discriminated union variants', () => {
      interface Circle {
        type: 'circle';
        radius: number;
      }

      interface Square {
        type: 'square';
        side: number;
      }

      const circleGen = object({
        type: Gen.constant('circle' as const),
        radius: int(Range.uniform(1, 10)),
      });

      const squareGen = object({
        type: Gen.constant('square' as const),
        side: int(Range.uniform(1, 10)),
      });

      const shapeGen = discriminatedUnion('type', {
        circle: circleGen,
        square: squareGen,
      });

      const values: Array<Circle | Square> = [];
      let currentSeed = seed;

      for (let i = 0; i < 20; i++) {
        const tree = shapeGen.generate(size, currentSeed);
        values.push(tree.value);
        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
      }

      const circles = values.filter((v) => v.type === 'circle');
      const squares = values.filter((v) => v.type === 'square');

      expect(circles.length).toBeGreaterThan(0);
      expect(squares.length).toBeGreaterThan(0);

      circles.forEach((circle) => {
        expect(circle).toHaveProperty('radius');
        expect(typeof circle.radius).toBe('number');
      });

      squares.forEach((square) => {
        expect(square).toHaveProperty('side');
        expect(typeof square.side).toBe('number');
      });
    });

    it('throws error for empty variants', () => {
      expect(() => discriminatedUnion('type', {})).toThrow(
        'discriminatedUnion requires at least one variant'
      );
    });

    it('validates discriminator values at runtime', () => {
      // New API: discriminator values are keys, preventing collisions at compile time
      const validGen = discriminatedUnion('type', {
        admin: object({
          type: Gen.constant('admin'),
          role: Gen.constant('administrator'),
        }),
        user: object({
          type: Gen.constant('user'),
          department: Gen.constant('engineering'),
        }),
      });

      // Should work fine - each variant has correct discriminator
      const values: any[] = [];
      let currentSeed = seed;

      for (let i = 0; i < 10; i++) {
        const tree = validGen.generate(size, currentSeed);
        values.push(tree.value);
        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
      }

      // Should have mix of both types
      const admins = values.filter((v) => v.type === 'admin');
      const users = values.filter((v) => v.type === 'user');

      expect(admins.length).toBeGreaterThan(0);
      expect(users.length).toBeGreaterThan(0);
    });

    it('throws error when generator produces wrong discriminator value', () => {
      // This should fail at runtime - generator produces wrong discriminator
      const invalidGen = discriminatedUnion('type', {
        circle: object({
          type: Gen.constant('wrong-value'), // Should be 'circle'
          radius: Gen.constant(5),
        }),
      });

      expect(() => {
        invalidGen.generate(size, seed);
      }).toThrow(/Discriminator value mismatch.*Expected.*circle.*wrong-value/);
    });

    it('throws error when generator missing discriminator field', () => {
      const invalidGen = discriminatedUnion('type', {
        circle: object({
          // Missing 'type' field!
          radius: Gen.constant(5),
        }),
      });

      expect(() => {
        invalidGen.generate(size, seed);
      }).toThrow(/Generated object missing discriminator field 'type'/);
    });

    it('works with Gen.discriminatedUnion() static method', () => {
      const gen = Gen.discriminatedUnion('kind', {
        success: object({
          kind: Gen.constant('success'),
          value: int(Range.uniform(1, 10)),
        }),
        error: object({ kind: Gen.constant('error'), message: string() }),
      });

      const tree = gen.generate(size, seed);
      expect(tree.value).toHaveProperty('kind');
      expect(['success', 'error']).toContain(tree.value.kind);
    });
  });

  describe('weightedUnion()', () => {
    it('respects weighted probabilities', () => {
      // Heavy weight on true, light weight on false
      const gen = weightedUnion([
        [9, Gen.constant(true)],
        [1, Gen.constant(false)],
      ]);

      const values: boolean[] = [];
      let currentSeed = seed;

      // Generate many values to test probability distribution
      for (let i = 0; i < 100; i++) {
        const tree = gen.generate(size, currentSeed);
        values.push(tree.value);
        const [, newSeed] = currentSeed.split();
        currentSeed = newSeed;
      }

      const trueCount = values.filter((v) => v === true).length;
      const falseCount = values.filter((v) => v === false).length;

      // Should have more trues than falses (though not exact due to randomness)
      expect(trueCount).toBeGreaterThan(falseCount);
      expect(trueCount).toBeGreaterThan(60); // Expect roughly 90% trues
    });

    it('generates shrinks including other weighted alternatives', () => {
      const gen = weightedUnion([
        [1, int(Range.uniform(50, 100))],
        [1, Gen.constant('fallback')],
      ]);

      const tree = gen.generate(size, seed);
      expect(tree.hasShrinks()).toBe(true);

      const shrinks = tree.shrinks();
      if (typeof tree.value === 'number') {
        expect(shrinks).toContain('fallback');
      } else {
        expect(shrinks.some((v) => typeof v === 'number')).toBe(true);
      }
    });

    it('throws error for empty choices', () => {
      expect(() => weightedUnion([])).toThrow(
        'weightedUnion requires at least one choice'
      );
    });

    it('throws error for non-positive total weight', () => {
      expect(() => weightedUnion([[0, Gen.constant(1)]])).toThrow(
        'weightedUnion requires positive total weight'
      );
    });

    it('works with Gen.weightedUnion() static method', () => {
      const gen = Gen.weightedUnion([
        [2, Gen.constant('common')],
        [1, Gen.constant('rare')],
      ]);

      const tree = gen.generate(size, seed);
      expect(['common', 'rare']).toContain(tree.value);
    });
  });

  describe('complex nested unions', () => {
    it('handles nested optional and union types', () => {
      const complexGen = optional(
        union(int(Range.uniform(1, 100)), nullable(string()), bool())
      );

      const tree = complexGen.generate(size, seed);

      // Should be undefined, or a number, or null, or a string, or a boolean
      expect(
        tree.value === undefined ||
          typeof tree.value === 'number' ||
          tree.value === null ||
          typeof tree.value === 'string' ||
          typeof tree.value === 'boolean'
      ).toBe(true);
    });

    it('handles unions of complex objects', () => {
      const userGen = object({
        type: Gen.constant('user'),
        name: string(),
        age: int(Range.uniform(0, 100)),
      });

      const adminGen = object({
        type: Gen.constant('admin'),
        name: string(),
        permissions: Gen.constant(['read', 'write']),
      });

      const personGen = union(userGen, adminGen);
      const tree = personGen.generate(size, seed);

      expect(tree.value).toHaveProperty('type');
      expect(['user', 'admin']).toContain(tree.value.type);
      expect(tree.value).toHaveProperty('name');
      expect(typeof tree.value.name).toBe('string');
    });
  });
});
