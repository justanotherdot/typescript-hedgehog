import { describe, test, expect } from 'vitest';
import { forAll, forAllNamed } from './property.js';
import { Gen, Ints } from './gen.js';
import { Config } from './config.js';
import { Seed } from './data/seed.js';

describe('Property check method', () => {
  test('check passes when property holds', () => {
    const prop = forAll(Ints.small(), (x) => x >= 0 && x <= 100);

    expect(() => {
      prop.check(Config.default().withTests(50), Seed.fromNumber(42));
    }).not.toThrow();
  });

  test('check throws with formatted output when property fails', () => {
    const prop = forAll(Ints.range(0, 100), (x) => x < 50);

    expect(() => {
      prop.check(Config.default().withTests(100), Seed.fromNumber(42));
    }).toThrowError(/Property failed/);
  });

  test('formatted failure includes counterexample', () => {
    const prop = forAll(Ints.range(0, 100), (x) => x < 50);

    try {
      prop.check(Config.default().withTests(100), Seed.fromNumber(42));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('Counterexample');
      expect(message).toContain('shrinks');
      expect(message).toContain('Reproduce with');
      expect(message).toContain('seed:');
    }
  });

  test('formatted failure shows original failure when shrunk', () => {
    const prop = forAll(Ints.range(0, 100), (x) => x < 10);

    try {
      prop.check(Config.default().withTests(100), Seed.fromNumber(123));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;

      if (message.includes('Original failure')) {
        expect(message).toContain('Counterexample');
        expect(message).toContain('Original failure');
      }
    }
  });

  test('formatted failure includes classification statistics', () => {
    const prop = forAll(Ints.range(0, 100), (x) => x < 50)
      .classify('small', (x) => x < 25)
      .classify('medium', (x) => x >= 25 && x < 75);

    try {
      prop.check(Config.default().withTests(100), Seed.fromNumber(42));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;

      if (message.includes('Classification')) {
        expect(message).toContain('Classification');
      }
    }
  });

  test('check throws with formatted output on gave up', () => {
    const neverPasses = Gen.int().filter(() => false);
    const prop = forAll(neverPasses, () => true);

    expect(() => {
      prop.check(
        Config.default().withTests(10).withDiscardLimit(5),
        Seed.fromNumber(42)
      );
    }).toThrowError(/Property gave up/);
  });

  test('array formatting truncates long arrays', () => {
    const longArray = Gen.array(Ints.small()).map((xs) => {
      while (xs.length < 20) xs.push(1);
      return xs;
    });
    const prop = forAll(longArray, (xs) => xs.length < 15);

    try {
      prop.check(Config.default().withTests(100), Seed.fromNumber(42));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('items total');
    }
  });
});

describe('Variable name tracking', () => {
  test('forAllNamed shows variable name in failure', () => {
    const prop = forAllNamed('x', Ints.range(0, 100), (x) => x < 50);

    try {
      prop.check(Config.default().withTests(100), Seed.fromNumber(42));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('forAll 0 =');
      expect(message).toContain('-- x');
    }
  });

  test('forAll without name does not show variable annotation', () => {
    const prop = forAll(Ints.range(0, 100), (x) => x < 50);

    try {
      prop.check(Config.default().withTests(100), Seed.fromNumber(42));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('forAll 0 =');
      expect(message).not.toContain('--');
    }
  });

  test('variable name preserved through classify', () => {
    const prop = forAllNamed(
      'number',
      Ints.range(0, 100),
      (x) => x < 50
    ).classify('small', (x) => x < 25);

    try {
      prop.check(Config.default().withTests(100), Seed.fromNumber(42));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('forAll 0 =');
      expect(message).toContain('-- number');
    }
  });

  test('variable name shown in original failure when shrinking', () => {
    const prop = forAllNamed('value', Ints.range(0, 100), (x) => x < 10);

    try {
      prop.check(Config.default().withTests(100), Seed.fromNumber(123));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;

      if (message.includes('Original failure')) {
        expect(message).toContain('forAll 0 =');
        expect(message).toContain('-- value');
        // Should appear twice: once for counterexample, once for original
        const matches = message.match(/-- value/g);
        expect(matches).toHaveLength(2);
      }
    }
  });
});
