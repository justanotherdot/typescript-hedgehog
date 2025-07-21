import { describe, it, expect } from 'vitest';
import { Gen } from '../gen.js';
import { array, arrayOfLength, object, tuple } from './collection.js';
import { bool, int, string } from './primitive.js';
import { Range } from '../data/size.js';
import { Size } from '../data/size.js';
import { Seed } from '../seed/bigint.js';

describe('Collection generators', () => {
  const seed = Seed.fromNumber(42);
  const size = Size.of(10);

  describe('array()', () => {
    it('generates arrays within size bounds', () => {
      const gen = array(int(Range.uniform(1, 100)));
      const tree = gen.generate(size, seed);

      expect(Array.isArray(tree.value)).toBe(true);
      expect(tree.value.length).toBeLessThanOrEqual(size.get());
      expect(tree.value.every((x) => typeof x === 'number')).toBe(true);
    });

    it('respects minLength option', () => {
      const gen = array(bool(), { minLength: 5 });
      const tree = gen.generate(size, seed);

      expect(tree.value.length).toBeGreaterThanOrEqual(5);
    });

    it('respects maxLength option', () => {
      const gen = array(bool(), { maxLength: 3 });
      const tree = gen.generate(size, seed);

      expect(tree.value.length).toBeLessThanOrEqual(3);
    });

    it('respects exact length option', () => {
      const gen = array(bool(), { length: 7 });
      const tree = gen.generate(size, seed);

      expect(tree.value.length).toBe(7);
    });

    it('generates proper shrinks by reducing length', () => {
      const gen = array(bool(), { length: 3 });
      const tree = gen.generate(size, seed);

      expect(tree.hasShrinks()).toBe(true);
      const shrinks = tree.shrinks();

      // Should have shrinks for length 0, 1, 2
      const lengths = shrinks.map((s) => s.length);
      expect(lengths).toContain(0);
      expect(lengths).toContain(1);
      expect(lengths).toContain(2);
    });

    it('generates shrinks for individual elements', () => {
      const gen = array(int(Range.uniform(10, 20)), { length: 2 });
      const tree = gen.generate(size, seed);

      expect(tree.hasShrinks()).toBe(true);
      const shrinks = tree.shrinks();

      // Should have some shrinks that modify individual elements
      const elementShrinks = shrinks.filter((s) => s.length === 2);
      expect(elementShrinks.length).toBeGreaterThan(0);
    });

    it('works with Gen.array() static method', () => {
      const gen = Gen.array(string(), { maxLength: 5 });
      const tree = gen.generate(size, seed);

      expect(Array.isArray(tree.value)).toBe(true);
      expect(tree.value.length).toBeLessThanOrEqual(5);
    });
  });

  describe('arrayOfLength()', () => {
    it('generates arrays of exact length', () => {
      const gen = arrayOfLength(bool(), 5);
      const tree = gen.generate(size, seed);

      expect(tree.value.length).toBe(5);
      expect(tree.value.every((x) => typeof x === 'boolean')).toBe(true);
    });

    it('generates empty arrays for length 0', () => {
      const gen = arrayOfLength(int(Range.uniform(1, 10)), 0);
      const tree = gen.generate(size, seed);

      expect(tree.value).toEqual([]);
      expect(tree.hasShrinks()).toBe(false);
    });

    it('works with Gen.arrayOfLength() static method', () => {
      const gen = Gen.arrayOfLength(string(), 3);
      const tree = gen.generate(size, seed);

      expect(tree.value.length).toBe(3);
    });
  });

  describe('object()', () => {
    it('generates objects with correct properties', () => {
      const schema = {
        name: string(),
        age: int(Range.uniform(0, 100)),
        active: bool(),
      };

      const gen = object(schema);
      const tree = gen.generate(size, seed);

      expect(typeof tree.value).toBe('object');
      expect(tree.value).toHaveProperty('name');
      expect(tree.value).toHaveProperty('age');
      expect(tree.value).toHaveProperty('active');

      expect(typeof tree.value.name).toBe('string');
      expect(typeof tree.value.age).toBe('number');
      expect(typeof tree.value.active).toBe('boolean');
    });

    it('generates empty objects for empty schema', () => {
      const gen = object({});
      const tree = gen.generate(size, seed);

      expect(tree.value).toEqual({});
    });

    it('generates shrinks for individual properties', () => {
      const schema = {
        count: int(Range.uniform(5, 15)),
        flag: bool(),
      };

      const gen = object(schema);
      const tree = gen.generate(size, seed);

      if (tree.hasShrinks()) {
        const shrinks = tree.shrinks();
        expect(shrinks.length).toBeGreaterThan(0);

        // All shrinks should maintain the object structure
        shrinks.forEach((shrink) => {
          expect(shrink).toHaveProperty('count');
          expect(shrink).toHaveProperty('flag');
        });
      }
    });

    it('preserves type information', () => {
      interface User {
        id: number;
        name: string;
        email: string;
      }

      const userSchema = {
        id: int(Range.uniform(1, 1000)),
        name: string(),
        email: string(),
      };

      const gen: Gen<User> = object(userSchema);
      const tree = gen.generate(size, seed);

      // TypeScript should infer this correctly
      const user: User = tree.value;
      expect(typeof user.id).toBe('number');
      expect(typeof user.name).toBe('string');
      expect(typeof user.email).toBe('string');
    });

    it('works with Gen.object() static method', () => {
      const gen = Gen.object({
        x: int(Range.uniform(1, 10)),
        y: bool(),
      });

      const tree = gen.generate(size, seed);
      expect(tree.value).toHaveProperty('x');
      expect(tree.value).toHaveProperty('y');
    });
  });

  describe('tuple()', () => {
    it('generates tuples with correct types', () => {
      const gen = tuple(string(), int(Range.uniform(1, 100)), bool());

      const tree = gen.generate(size, seed);

      expect(Array.isArray(tree.value)).toBe(true);
      expect(tree.value.length).toBe(3);
      expect(typeof tree.value[0]).toBe('string');
      expect(typeof tree.value[1]).toBe('number');
      expect(typeof tree.value[2]).toBe('boolean');
    });

    it('generates empty tuples for no generators', () => {
      const gen = tuple();
      const tree = gen.generate(size, seed);

      expect(tree.value).toEqual([]);
    });

    it('generates shrinks for individual elements', () => {
      const gen = tuple(int(Range.uniform(10, 20)), bool());

      const tree = gen.generate(size, seed);

      if (tree.hasShrinks()) {
        const shrinks = tree.shrinks();
        expect(shrinks.length).toBeGreaterThan(0);

        // All shrinks should maintain tuple length
        shrinks.forEach((shrink) => {
          expect(shrink.length).toBe(2);
        });
      }
    });

    it('preserves tuple type information', () => {
      const gen = tuple(string(), int(Range.uniform(1, 10)), bool());
      type Expected = [string, number, boolean];

      const tree = gen.generate(size, seed);
      const result: Expected = tree.value;

      expect(typeof result[0]).toBe('string');
      expect(typeof result[1]).toBe('number');
      expect(typeof result[2]).toBe('boolean');
    });

    it('works with Gen.tuple() static method', () => {
      const gen = Gen.tuple(bool(), string());
      const tree = gen.generate(size, seed);

      expect(tree.value.length).toBe(2);
      expect(typeof tree.value[0]).toBe('boolean');
      expect(typeof tree.value[1]).toBe('string');
    });
  });

  describe('complex nested structures', () => {
    it('generates nested arrays and objects', () => {
      const schema = {
        users: array(
          object({
            id: int(Range.uniform(1, 1000)),
            active: bool(),
          }),
          { maxLength: 3 }
        ),
        metadata: object({
          version: string(),
          tags: array(string(), { maxLength: 2 }),
        }),
      };

      const gen = object(schema);
      const tree = gen.generate(size, seed);

      expect(Array.isArray(tree.value.users)).toBe(true);
      expect(tree.value.users.length).toBeLessThanOrEqual(3);
      expect(typeof tree.value.metadata).toBe('object');
      expect(Array.isArray(tree.value.metadata.tags)).toBe(true);

      // Check user objects
      tree.value.users.forEach((user) => {
        expect(typeof user.id).toBe('number');
        expect(typeof user.active).toBe('boolean');
      });
    });

    it('generates tuples containing objects and arrays', () => {
      const gen = tuple(
        object({ name: string(), age: int(Range.uniform(0, 100)) }),
        array(bool(), { maxLength: 5 }),
        string()
      );

      const tree = gen.generate(size, seed);
      const [userObj, boolArray, str] = tree.value;

      expect(typeof userObj).toBe('object');
      expect(userObj).toHaveProperty('name');
      expect(userObj).toHaveProperty('age');

      expect(Array.isArray(boolArray)).toBe(true);
      expect(boolArray.length).toBeLessThanOrEqual(5);
      expect(boolArray.every((x) => typeof x === 'boolean')).toBe(true);

      expect(typeof str).toBe('string');
    });
  });
});
