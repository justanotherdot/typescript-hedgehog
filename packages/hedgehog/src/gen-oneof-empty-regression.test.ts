import { describe, test, expect } from 'vitest';
import { Gen } from './index.js';

describe('Gen.oneOf empty array regression test', () => {
  // Regression test for: "Cannot convert undefined to a BigInt" when using Gen.oneOf with empty arrays
  // This was caused by spread operator with empty arrays passing undefined as first parameter

  test('Gen.oneOf([]) throws clear error message', () => {
    expect(() => {
      Gen.oneOf([]);
    }).toThrow('oneOf requires at least one generator');
  });

  test('Gen.oneOf(...[]) throws clear error message (regression case)', () => {
    const emptyArray: Gen<any>[] = [];
    expect(() => {
      Gen.oneOf(...emptyArray);
    }).toThrow('oneOf requires at least one generator');
  });

  test('Gen.oneOf(...emptyMap) throws clear error message (Line project pattern)', () => {
    const emptyKeys: string[] = [];
    expect(() => {
      Gen.oneOf(...emptyKeys.map(Gen.constant));
    }).toThrow('oneOf requires at least one generator');
  });

  test('Gen.oneOf with valid generators continues to work', () => {
    const gen1 = Gen.constant('a');
    const gen2 = Gen.constant('b');

    // Array form
    expect(() => Gen.oneOf([gen1, gen2])).not.toThrow();

    // Spread form
    expect(() => Gen.oneOf(gen1, gen2)).not.toThrow();

    // Mixed usage
    const generators = [gen1, gen2];
    expect(() => Gen.oneOf(...generators)).not.toThrow();
  });

  test('prevents the original BigInt conversion error', () => {
    // This specific pattern was causing "Cannot convert undefined to a BigInt"
    // because undefined was being passed through the generation chain
    const emptyTeamIds: any[] = [];

    expect(() => {
      const _badGenerator = Gen.oneOf(...emptyTeamIds.map(Gen.constant));
      // The error should happen at construction time, not generation time
    }).toThrow('oneOf requires at least one generator');

    // Should NOT throw BigInt-related errors
    expect(() => {
      Gen.oneOf(...emptyTeamIds.map(Gen.constant));
    }).not.toThrow(/BigInt/);
  });
});
