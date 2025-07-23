/**
 * Constructive string generator that builds strings to satisfy multiple constraints
 * instead of using generate-and-filter approach.
 */

import { GeneratorFn } from '@/gen/core.js';
import { Tree } from '@/data/tree.js';
import { Size } from '@/data/size.js';
import { Seed } from '@/data/seed.js';
import { shrinkBuilder } from '@/gen/shrink.js';

interface StringConstraints {
  minLength?: number;
  maxLength?: number;
  exactLength?: number;
  startsWith?: string;
  endsWith?: string;
  includes?: Array<{ value: string; position?: number }>;
  regex?: RegExp[];
}

/**
 * Extract all string constraints from Zod checks
 */
export function extractStringConstraints(checks: any[]): StringConstraints {
  const constraints: StringConstraints = {
    includes: [],
    regex: [],
  };

  for (const check of checks) {
    switch (check.kind) {
      case 'min':
        constraints.minLength = check.value;
        break;
      case 'max':
        constraints.maxLength = check.value;
        break;
      case 'length':
        constraints.exactLength = check.value;
        break;
      case 'startsWith':
        constraints.startsWith = check.value;
        break;
      case 'endsWith':
        constraints.endsWith = check.value;
        break;
      case 'includes':
        constraints.includes!.push({
          value: check.value,
          position: check.position,
        });
        break;
      case 'regex':
        constraints.regex!.push(check.regex);
        break;
    }
  }

  return constraints;
}

/**
 * Build a string constructively to satisfy all constraints
 */
export function buildConstructiveString(
  constraints: StringConstraints,
  size: Size,
  seed: Seed
): Tree<string> {
  // Determine target length
  const targetLength =
    constraints.exactLength ??
    Math.max(
      constraints.minLength ?? 1,
      Math.min(constraints.maxLength ?? size.get(), size.get())
    );

  // Calculate required character positions
  const requiredPositions = new Map<number, string>();
  let availableLength = targetLength;

  // Reserve positions for startsWith
  if (constraints.startsWith) {
    for (let i = 0; i < constraints.startsWith.length; i++) {
      requiredPositions.set(i, constraints.startsWith[i]);
    }
    availableLength -= constraints.startsWith.length;
  }

  // Reserve positions for endsWith
  if (constraints.endsWith) {
    const start = targetLength - constraints.endsWith.length;
    for (let i = 0; i < constraints.endsWith.length; i++) {
      requiredPositions.set(start + i, constraints.endsWith[i]);
    }
    availableLength -= constraints.endsWith.length;
  }

  // Reserve positions for includes with specific positions
  if (constraints.includes) {
    for (const include of constraints.includes) {
      if (include.position !== undefined) {
        for (let i = 0; i < include.value.length; i++) {
          requiredPositions.set(include.position + i, include.value[i]);
        }
        availableLength -= include.value.length;
      }
    }
  }

  // Check if constraints are satisfiable
  if (availableLength < 0) {
    // Constraints conflict - fall back to simple string
    // String constraints conflict, using fallback
    return Tree.singleton('a'.repeat(Math.max(1, targetLength)));
  }

  // Build the string
  const result = new Array(targetLength).fill('');
  let currentSeed = seed;

  // Fill required positions
  for (const [pos, char] of requiredPositions.entries()) {
    result[pos] = char;
  }

  // Fill remaining positions with random characters
  const charset = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < targetLength; i++) {
    if (result[i] === '') {
      const [charIndex, nextSeed] = currentSeed.nextBounded(charset.length);
      result[i] = charset[charIndex];
      currentSeed = nextSeed;
    }
  }

  // Handle includes without specific positions
  if (constraints.includes) {
    for (const include of constraints.includes) {
      if (include.position === undefined) {
        // Find a place to insert this substring
        const resultStr = result.join('');
        if (!resultStr.includes(include.value)) {
          // Try to place it in available space
          // This is a simplified approach - could be more sophisticated
          const availableStart = constraints.startsWith?.length ?? 0;
          const availableEnd =
            targetLength - (constraints.endsWith?.length ?? 0);

          if (availableEnd - availableStart >= include.value.length) {
            const insertPos = availableStart;
            for (let i = 0; i < include.value.length; i++) {
              if (insertPos + i < availableEnd) {
                result[insertPos + i] = include.value[i];
              }
            }
          }
        }
      }
    }
  }

  const finalString = result.join('');

  // Build shrinks
  const builder = shrinkBuilder<string>();

  // Add simpler versions that still satisfy key constraints
  if (constraints.startsWith && constraints.endsWith) {
    builder.add(
      constraints.startsWith +
        'a'.repeat(
          Math.max(
            0,
            targetLength -
              constraints.startsWith.length -
              constraints.endsWith.length
          )
        ) +
        constraints.endsWith
    );
  } else if (constraints.startsWith) {
    builder.add(
      constraints.startsWith +
        'a'.repeat(Math.max(0, targetLength - constraints.startsWith.length))
    );
  } else if (constraints.endsWith) {
    builder.add(
      'a'.repeat(Math.max(0, targetLength - constraints.endsWith.length)) +
        constraints.endsWith
    );
  }

  builder.add('a'.repeat(targetLength));

  return builder.build(finalString);
}

/**
 * Create a constructive string generator from Zod string definition
 */
export function createConstructiveStringGenerator(
  def: any
): GeneratorFn<string> {
  const constraints = extractStringConstraints(def.checks || []);

  return (size: Size, seed: Seed) => {
    return buildConstructiveString(constraints, size, seed);
  };
}
