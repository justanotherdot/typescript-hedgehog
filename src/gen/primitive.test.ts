import { describe, test, expect } from 'vitest';
import { bool, int, string, Ints, Strings } from './primitive';
import { Range, Size } from '../data/size';
import { Seed } from '../data/seed';

describe('primitive generators', () => {
  const size = Size.of(10);
  const seed = Seed.fromNumber(42);

  describe('bool', () => {
    test('generates boolean values', () => {
      const gen = bool();
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
      const gen = int(range);
      const tree = gen.generate(size, seed);

      expect(Number.isInteger(tree.value)).toBe(true);
      expect(tree.value).toBeGreaterThanOrEqual(1);
      expect(tree.value).toBeLessThanOrEqual(10);
    });

    test('generates shrinks towards origin', () => {
      const range = Range.uniform(0, 100).withOrigin(0);
      const gen = int(range);
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
      const gen = int(range);
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
      const gen = string();
      const tree = gen.generate(size, seed);

      expect(typeof tree.value).toBe('string');
      expect(tree.value.length).toBeLessThanOrEqual(size.get());
    });

    test('generates shrinks by reducing length', () => {
      const gen = string();
      const tree = gen.generate(Size.of(5), seed);

      if (tree.value.length > 0) {
        expect(tree.hasShrinks()).toBe(true);
        const shrinks = tree.shrinks();
        
        // Should include empty string
        expect(shrinks).toContain('');
        
        // Should include shorter strings
        const shorterShrinks = shrinks.filter(s => s.length < tree.value.length);
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

    test('asciiOfLength generates exact length', () => {
      const gen = Strings.asciiOfLength(5);
      const tree = gen.generate(size, seed);

      expect(tree.value).toHaveLength(5);
    });
  });
});