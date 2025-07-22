import { GeneratorFn, create, sized, constant, frequency } from './core.js';
import { Range } from '../data/size';
import { Tree } from '../data/tree';
import { Seed } from '../data/seed';

/**
 * Primitive generators for basic data types.
 */

/**
 * Generate a boolean value.
 */
export function bool(): GeneratorFn<boolean> {
  return create((_size, seed) => {
    const [value] = seed.nextBool();
    const children = [Tree.singleton(!value)]; // Shrink to opposite
    return Tree.withChildren(value, children);
  });
}

/**
 * Generate an integer within a range with integrated shrinking.
 */
export function int(range: Range<number>): GeneratorFn<number> {
  return create((_size, seed) => {
    const rangeSize = Math.max(1, range.max - range.min + 1);
    const [offset] = seed.nextBounded(rangeSize);
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
export function string(): GeneratorFn<string> {
  return sized((size) => {
    const maxLength = size.get();
    return create((_, seed) => {
      const [length, newSeed] = seed.nextBounded(maxLength + 1);
      return generateStringOfLength(length, newSeed);
    });
  });
}

/**
 * Generate a string of exactly the specified length.
 */
export function stringOfLength(length: number): GeneratorFn<string> {
  return create((_size, seed) => {
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
  small: (): GeneratorFn<number> => int(Range.uniform(0, 100).withOrigin(0)),

  /** Any positive integer [0, Number.MAX_SAFE_INTEGER] */
  positive: (): GeneratorFn<number> =>
    int(Range.linear(0, Number.MAX_SAFE_INTEGER).withOrigin(0)),

  /** Any integer [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] */
  any: (): GeneratorFn<number> =>
    int(
      Range.linear(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER).withOrigin(
        0
      )
    ),

  /** Integers in a specific range */
  range: (min: number, max: number): GeneratorFn<number> =>
    int(Range.uniform(min, max).withOrigin(0)),
} as const;

/**
 * Common string generators.
 */
export const Strings = {
  /** ASCII strings of any length */
  ascii: (): GeneratorFn<string> => string(),

  /** ASCII strings of specific length */
  asciiOfLength: (length: number): GeneratorFn<string> =>
    stringOfLength(length),

  /** Alphabetic strings (a-z, A-Z) */
  alpha: (): GeneratorFn<string> =>
    sized((size) => {
      const maxLength = size.get();
      return create((_, seed) => {
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

/**
 * Enhanced number generation with constraints.
 */
export function number(options?: {
  min?: number;
  max?: number;
  multipleOf?: number;
  finite?: boolean;
  safe?: boolean;
}): GeneratorFn<number> {
  const opts = {
    min: Number.MIN_SAFE_INTEGER,
    max: Number.MAX_SAFE_INTEGER,
    finite: true,
    safe: true,
    ...options,
  };

  // Handle special values first
  if (!opts.finite) {
    return frequency([
      [8, finiteNumber(opts)], // 80% finite numbers
      [1, constant(Infinity)], // 10% Infinity
      [1, constant(-Infinity)], // 10% -Infinity
    ]);
  }

  return finiteNumber(opts);
}

/**
 * Generate finite numbers within constraints.
 */
function finiteNumber(opts: {
  min: number;
  max: number;
  multipleOf?: number;
  safe: boolean;
}): GeneratorFn<number> {
  return create((_size, seed) => {
    let min = opts.min;
    let max = opts.max;

    // Apply safe number constraints
    if (opts.safe) {
      min = Math.max(min, Number.MIN_SAFE_INTEGER);
      max = Math.min(max, Number.MAX_SAFE_INTEGER);
    }

    // Generate base number
    const range = max - min;
    const [fraction] = seed.nextFloat();
    let value = min + fraction * range;

    // Apply multipleOf constraint
    if (opts.multipleOf !== undefined && opts.multipleOf > 0) {
      value = Math.round(value / opts.multipleOf) * opts.multipleOf;
      // Ensure still within bounds
      value = Math.max(min, Math.min(max, value));
    }

    // Generate shrinks towards 0 (or closest valid value)
    const origin = Math.max(min, Math.min(max, 0));
    const shrinks = generateNumberShrinks(
      value,
      origin,
      min,
      max,
      opts.multipleOf
    );

    return Tree.withChildren(value, shrinks);
  });
}

/**
 * Generate shrinks for number values.
 */
function generateNumberShrinks(
  value: number,
  origin: number,
  min: number,
  max: number,
  multipleOf?: number
): Tree<number>[] {
  if (value === origin) {
    return [];
  }

  const shrinks: Tree<number>[] = [];

  // Shrink towards origin
  let candidate =
    value > origin
      ? Math.floor((value + origin) / 2)
      : Math.ceil((value + origin) / 2);

  // Apply multipleOf constraint if present
  if (multipleOf !== undefined && multipleOf > 0) {
    candidate = Math.round(candidate / multipleOf) * multipleOf;
  }

  // Ensure within bounds and different from current value
  if (candidate !== value && candidate >= min && candidate <= max) {
    const childShrinks = generateNumberShrinks(
      candidate,
      origin,
      min,
      max,
      multipleOf
    );
    shrinks.push(Tree.withChildren(candidate, childShrinks));
  }

  // Try origin directly if valid
  if (origin !== value && origin >= min && origin <= max) {
    if (
      multipleOf === undefined ||
      multipleOf <= 0 ||
      origin % multipleOf === 0
    ) {
      shrinks.push(Tree.singleton(origin));
    }
  }

  return shrinks;
}

/**
 * Generate Date objects within a range.
 */
export function date(options?: { min?: Date; max?: Date }): GeneratorFn<Date> {
  const now = new Date();
  const opts = {
    min: new Date(1970, 0, 1), // Unix epoch
    max: new Date(now.getFullYear() + 10, 11, 31), // 10 years from now
    ...options,
  };

  return create((_size, seed) => {
    const minTime = opts.min.getTime();
    const maxTime = opts.max.getTime();
    const range = maxTime - minTime;

    const [fraction] = seed.nextFloat();
    const timestamp = minTime + fraction * range;
    const value = new Date(timestamp);

    // Generate shrinks towards epoch or min date
    const origin = opts.min;
    const shrinks = generateDateShrinks(value, origin, opts.min, opts.max);

    return Tree.withChildren(value, shrinks);
  });
}

/**
 * Generate shrinks for Date values.
 */
function generateDateShrinks(
  value: Date,
  origin: Date,
  min: Date,
  max: Date
): Tree<Date>[] {
  const valueTime = value.getTime();
  const originTime = origin.getTime();

  if (valueTime === originTime) {
    return [];
  }

  const shrinks: Tree<Date>[] = [];

  // Shrink towards origin
  const candidateTime = Math.floor((valueTime + originTime) / 2);
  const candidate = new Date(candidateTime);

  if (candidateTime !== valueTime && candidate >= min && candidate <= max) {
    const childShrinks = generateDateShrinks(candidate, origin, min, max);
    shrinks.push(Tree.withChildren(candidate, childShrinks));
  }

  // Try origin directly
  if (origin >= min && origin <= max && origin.getTime() !== valueTime) {
    shrinks.push(Tree.singleton(origin));
  }

  return shrinks;
}

/**
 * Generate enum values from an array.
 */
export function enumValue<T extends readonly [string, ...string[]]>(
  values: T
): GeneratorFn<T[number]> {
  return create((_size, seed) => {
    const [index] = seed.nextBounded(values.length);
    const value = values[index] as T[number];

    // Shrink towards first element
    const shrinks: Tree<T[number]>[] = [];
    if (index > 0) {
      shrinks.push(Tree.singleton(values[0] as T[number]));
    }

    return Tree.withChildren(value, shrinks);
  });
}

/**
 * Generate literal values (always returns the same value).
 */
export function literal<T extends string | number | boolean>(
  value: T
): GeneratorFn<T> {
  return constant(value);
}
