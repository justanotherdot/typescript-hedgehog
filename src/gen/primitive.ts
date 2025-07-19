import { Gen } from '../gen';
import { Range } from '../data/size';
import { Tree } from '../data/tree';
import { Seed } from '../data/seed';

/**
 * Primitive generators for basic data types.
 */

/**
 * Generate a boolean value.
 */
export function bool(): Gen<boolean> {
  return Gen.create((_size, seed) => {
    const [value, _newSeed] = seed.nextBool();
    const children = [Tree.singleton(!value)]; // Shrink to opposite
    return Tree.withChildren(value, children);
  });
}

/**
 * Generate an integer within a range with integrated shrinking.
 */
export function int(range: Range<number>): Gen<number> {
  return Gen.create((_size, seed) => {
    const rangeSize = Math.max(1, range.max - range.min + 1);
    const [offset, _newSeed] = seed.nextBounded(rangeSize);
    const value = range.min + offset;

    // Generate shrinks towards origin (or zero if no origin specified)
    const origin = range.origin ?? 0;
    const clampedOrigin = Math.max(range.min, Math.min(range.max, origin));
    const shrinks = generateIntShrinks(value, clampedOrigin, range);

    return Tree.withChildren(value, shrinks);
  });
}

/**
 * Generate shrinks for integer values towards an origin.
 */
function generateIntShrinks(
  value: number,
  origin: number,
  range: Range<number>
): Tree<number>[] {
  if (value === origin) {
    return [];
  }

  const shrinks: Tree<number>[] = [];

  // Shrink towards origin
  if (value > origin) {
    // Try halving the distance to origin
    const mid = Math.floor((value + origin) / 2);
    if (mid !== value && range.contains(mid)) {
      const childShrinks = generateIntShrinks(mid, origin, range);
      shrinks.push(Tree.withChildren(mid, childShrinks));
    }

    // Try origin directly if in range
    if (range.contains(origin)) {
      shrinks.push(Tree.singleton(origin));
    }
  } else {
    // value < origin
    const mid = Math.ceil((value + origin) / 2);
    if (mid !== value && range.contains(mid)) {
      const childShrinks = generateIntShrinks(mid, origin, range);
      shrinks.push(Tree.withChildren(mid, childShrinks));
    }

    if (range.contains(origin)) {
      shrinks.push(Tree.singleton(origin));
    }
  }

  return shrinks;
}

/**
 * Generate a string of ASCII characters.
 */
export function string(): Gen<string> {
  return Gen.sized((size) => {
    const maxLength = size.get();
    return Gen.create((_, seed) => {
      const [length, newSeed] = seed.nextBounded(maxLength + 1);
      return generateStringOfLength(length, newSeed);
    });
  });
}

/**
 * Generate a string of exactly the specified length.
 */
export function stringOfLength(length: number): Gen<string> {
  return Gen.create((_size, seed) => {
    return generateStringOfLength(length, seed);
  });
}

/**
 * Helper to generate a string of specific length with shrinking.
 */
function generateStringOfLength(length: number, seed: Seed): Tree<string> {
  if (length === 0) {
    return Tree.singleton('');
  }

  const chars: string[] = [];
  const charTrees: Tree<string>[] = [];
  let currentSeed = seed;

  // Generate each character
  for (let i = 0; i < length; i++) {
    const [charCode, newSeed] = currentSeed.nextBounded(95); // ASCII printable range (32-126)
    const char = String.fromCharCode(32 + charCode); // Start from space (32)
    chars.push(char);

    // Create tree for this character with shrinks towards simpler chars
    const charShrinks = generateCharShrinks(char);
    charTrees.push(Tree.withChildren(char, charShrinks));

    currentSeed = newSeed;
  }

  const fullString = chars.join('');
  const shrinks: Tree<string>[] = [];

  // Shrink by reducing length
  if (length > 0) {
    for (let newLength = 0; newLength < length; newLength++) {
      const shorterString = chars.slice(0, newLength).join('');
      shrinks.push(Tree.singleton(shorterString));
    }
  }

  // Shrink individual characters
  for (let i = 0; i < length; i++) {
    const charTree = charTrees[i];
    for (const shrunkChar of charTree.shrinks()) {
      const shrunkString =
        chars.slice(0, i).join('') + shrunkChar + chars.slice(i + 1).join('');
      shrinks.push(Tree.singleton(shrunkString));
    }
  }

  return Tree.withChildren(fullString, shrinks);
}

/**
 * Generate shrinks for characters towards simpler forms.
 */
function generateCharShrinks(char: string): Tree<string>[] {
  const charCode = char.charCodeAt(0);
  const shrinks: Tree<string>[] = [];

  // Shrink towards 'a', space, or '0' depending on the character
  if (char >= 'A' && char <= 'Z') {
    // Uppercase to lowercase
    shrinks.push(Tree.singleton(char.toLowerCase()));
  }

  if (char >= 'b' && char <= 'z') {
    // Lowercase letters towards 'a'
    shrinks.push(Tree.singleton('a'));
  }

  if (char >= '1' && char <= '9') {
    // Numbers towards '0'
    shrinks.push(Tree.singleton('0'));
  }

  if (charCode > 32) {
    // Special characters towards space
    shrinks.push(Tree.singleton(' '));
  }

  return shrinks;
}

/**
 * Common integer ranges.
 */
export const Ints = {
  /** Small positive integers [0, 100] */
  small: () => int(Range.uniform(0, 100).withOrigin(0)),

  /** Any positive integer [0, Number.MAX_SAFE_INTEGER] */
  positive: () => int(Range.linear(0, Number.MAX_SAFE_INTEGER).withOrigin(0)),

  /** Any integer [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] */
  any: () =>
    int(
      Range.linear(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER).withOrigin(
        0
      )
    ),

  /** Integers in a specific range */
  range: (min: number, max: number) => int(Range.uniform(min, max).withOrigin(0)),
} as const;

/**
 * Common string generators.
 */
export const Strings = {
  /** ASCII strings of any length */
  ascii: () => string(),

  /** ASCII strings of specific length */
  asciiOfLength: (length: number) => stringOfLength(length),

  /** Alphabetic strings (a-z, A-Z) */
  alpha: () =>
    Gen.sized((size) => {
      const maxLength = size.get();
      return Gen.create((_, seed) => {
        const [length, newSeed] = seed.nextBounded(maxLength + 1);
        return generateAlphaString(length, newSeed);
      });
    }),
} as const;

/**
 * Generate alphabetic string helper.
 */
function generateAlphaString(length: number, seed: Seed): Tree<string> {
  if (length === 0) {
    return Tree.singleton('');
  }

  const chars: string[] = [];
  let currentSeed = seed;

  for (let i = 0; i < length; i++) {
    const [isUpper, seed1] = currentSeed.nextBool();
    const [offset, seed2] = seed1.nextBounded(26);

    const baseCode = isUpper ? 65 : 97; // 'A' or 'a'
    const char = String.fromCharCode(baseCode + offset);
    chars.push(char);
    currentSeed = seed2;
  }

  const fullString = chars.join('');
  const shrinks: Tree<string>[] = [];

  // Shrink by length
  for (let newLength = 0; newLength < length; newLength++) {
    shrinks.push(Tree.singleton(chars.slice(0, newLength).join('')));
  }

  return Tree.withChildren(fullString, shrinks);
}