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

describe('Examples', () => {
  test('withExample adds single example to test', () => {
    const prop = forAll(Ints.range(0, 100), (x) => x !== 42).withExample(42);

    try {
      prop.check(Config.default(), Seed.fromNumber(1));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('Property failed');
    }
  });

  test('withExample can be chained multiple times', () => {
    const testedValues = new Set<number>();
    const prop = forAll(Ints.range(0, 100), (x) => {
      testedValues.add(x);
      return x < 40 || x > 60;
    })
      .withExample(42)
      .withExample(50)
      .withExample(55);

    try {
      prop.check(Config.default().withTests(0), Seed.fromNumber(1));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;
      // Should fail on first example (42) and stop
      expect(testedValues.has(42)).toBe(true);
      expect(message).toContain('Property failed');
    }
  });

  test('withExamples adds multiple examples at once', () => {
    const prop = forAll(
      Ints.range(0, 100),
      (x) => x !== 42 && x !== 50
    ).withExamples([42, 50]);

    try {
      prop.check(Config.default(), Seed.fromNumber(1));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('Property failed');
    }
  });

  test('examples tested before random generation', () => {
    let exampleTested = false;
    const prop = forAll(Ints.range(0, 100), (x) => {
      if (x === 99) exampleTested = true;
      return true;
    }).withExample(99);

    prop.check(Config.default().withTests(0), Seed.fromNumber(1));
    expect(exampleTested).toBe(true);
  });

  test('passing examples count toward test statistics', () => {
    const prop = forAll(Ints.range(0, 100), (x) => x >= 0).withExamples([
      1, 2, 3, 4, 5,
    ]);

    const result = prop.run(Config.default().withTests(10), Seed.fromNumber(1));
    expect(result.type).toBe('pass');
    if (result.type === 'pass') {
      // 5 examples + 10 random tests
      expect(result.stats.testsRun).toBe(15);
    }
  });

  test('examples work with classify', () => {
    const prop = forAll(Ints.range(0, 100), (x) => x >= 0)
      .classify('small', (x) => x < 25)
      .withExample(10)
      .withExample(50);

    const result = prop.run(Config.default().withTests(0), Seed.fromNumber(1));
    expect(result.type).toBe('pass');
    if (result.type === 'pass') {
      expect(result.stats.labels.has('small')).toBe(true);
      expect(result.stats.labels.get('small')).toBe(1); // only 10 is small
    }
  });

  test('examples preserved through classify chain', () => {
    const prop = forAll(Ints.range(0, 100), (x) => x !== 42)
      .withExample(42)
      .classify('even', (x) => x % 2 === 0);

    try {
      prop.check(Config.default(), Seed.fromNumber(1));
      throw new Error('Expected property to fail');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('Property failed');
    }
  });
});
