/**
 * Constraint-based generation strategy for basic Zod types with constraints.
 *
 * This strategy handles primitive types (string, number, boolean, etc.) with
 * basic constraints like min/max length, numeric ranges, etc.
 */

import { z } from 'zod';
import { Gen } from '@/gen.js';
import {
  ZodGenerationStrategy,
  ZodGenerationContext,
} from '../core/strategy.js';
import { GeneratorFn } from '@/gen/core.js';
import { Range, Size } from '@/data/size.js';
import { Seed } from '@/data/seed.js';
import { Tree } from '@/data/tree.js';
import { createConstructiveStringGenerator } from './constructive-string.js';

/**
 * Strategy that handles basic Zod types with simple constraints.
 * Medium priority - handles common cases efficiently.
 */
export class ConstraintStrategy implements ZodGenerationStrategy {
  readonly name = 'ConstraintStrategy';
  readonly priority = 50; // Medium priority

  canHandle(context: ZodGenerationContext): boolean {
    const { schema } = context;
    const def = (schema as any)._def;
    const typeName = def?.typeName;

    // Handle all basic first-party types
    const supportedTypes = [
      z.ZodFirstPartyTypeKind.ZodString,
      z.ZodFirstPartyTypeKind.ZodNumber,
      z.ZodFirstPartyTypeKind.ZodBigInt,
      z.ZodFirstPartyTypeKind.ZodBoolean,
      z.ZodFirstPartyTypeKind.ZodDate,
      z.ZodFirstPartyTypeKind.ZodSymbol,
      z.ZodFirstPartyTypeKind.ZodUndefined,
      z.ZodFirstPartyTypeKind.ZodNull,
      z.ZodFirstPartyTypeKind.ZodVoid,
      z.ZodFirstPartyTypeKind.ZodAny,
      z.ZodFirstPartyTypeKind.ZodUnknown,
      z.ZodFirstPartyTypeKind.ZodNaN,
      z.ZodFirstPartyTypeKind.ZodArray,
      z.ZodFirstPartyTypeKind.ZodObject,
      z.ZodFirstPartyTypeKind.ZodUnion,
      z.ZodFirstPartyTypeKind.ZodOptional,
      z.ZodFirstPartyTypeKind.ZodNullable,
      z.ZodFirstPartyTypeKind.ZodEnum,
      z.ZodFirstPartyTypeKind.ZodLiteral,
      z.ZodFirstPartyTypeKind.ZodTuple,
      z.ZodFirstPartyTypeKind.ZodRecord,
      z.ZodFirstPartyTypeKind.ZodMap,
      z.ZodFirstPartyTypeKind.ZodSet,
      z.ZodFirstPartyTypeKind.ZodIntersection,
      z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      z.ZodFirstPartyTypeKind.ZodNativeEnum,
      z.ZodFirstPartyTypeKind.ZodFunction,
      z.ZodFirstPartyTypeKind.ZodLazy,
    ];

    return supportedTypes.includes(typeName);
  }

  build(context: ZodGenerationContext): GeneratorFn<any> {
    const { schema, recurse, path } = context;
    const def = (schema as any)._def;
    const typeName = def.typeName as z.ZodFirstPartyTypeKind;

    switch (typeName) {
      case z.ZodFirstPartyTypeKind.ZodString:
        return this.buildStringGenerator(def);

      case z.ZodFirstPartyTypeKind.ZodNumber:
        return this.buildNumberGenerator(def);

      case z.ZodFirstPartyTypeKind.ZodBigInt:
        return this.buildBigIntGenerator(def);

      case z.ZodFirstPartyTypeKind.ZodBoolean:
        return Gen.bool().generator;

      case z.ZodFirstPartyTypeKind.ZodDate:
        return this.buildDateGenerator(def);

      case z.ZodFirstPartyTypeKind.ZodSymbol:
        return this.buildSymbolGenerator();

      case z.ZodFirstPartyTypeKind.ZodUndefined:
        return Gen.create(() => Tree.singleton(undefined)).generator;

      case z.ZodFirstPartyTypeKind.ZodNull:
        return Gen.create(() => Tree.singleton(null)).generator;

      case z.ZodFirstPartyTypeKind.ZodVoid:
        return Gen.create(() => Tree.singleton(undefined)).generator;

      case z.ZodFirstPartyTypeKind.ZodAny:
        return this.buildAnyGenerator();

      case z.ZodFirstPartyTypeKind.ZodUnknown:
        return this.buildUnknownGenerator();

      case z.ZodFirstPartyTypeKind.ZodNaN:
        return Gen.literal(NaN).generator;

      case z.ZodFirstPartyTypeKind.ZodArray:
        return this.buildArrayGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodObject:
        return this.buildObjectGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodUnion:
        return this.buildUnionGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodOptional:
        return this.buildOptionalGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodNullable:
        return this.buildNullableGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodEnum:
        return this.buildEnumGenerator(def);

      case z.ZodFirstPartyTypeKind.ZodLiteral:
        return this.buildLiteralGenerator(def);

      case z.ZodFirstPartyTypeKind.ZodTuple:
        return this.buildTupleGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodRecord:
        return this.buildRecordGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodMap:
        return this.buildMapGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodSet:
        return this.buildSetGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodIntersection:
        return this.buildIntersectionGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
        return this.buildDiscriminatedUnionGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodNativeEnum:
        return this.buildNativeEnumGenerator(def);

      case z.ZodFirstPartyTypeKind.ZodFunction:
        return this.buildFunctionGenerator(def, recurse, path);

      case z.ZodFirstPartyTypeKind.ZodLazy:
        return this.buildLazyGenerator(def, recurse, path);

      default:
        throw new Error(`ConstraintStrategy: Unsupported type ${typeName}`);
    }
  }

  private buildStringGenerator(def: any): GeneratorFn<string> {
    const checks = def.checks || [];

    // Check if we have complex constraints that need constructive generation
    const hasComplexConstraints = checks.some((check: any) =>
      ['startsWith', 'endsWith', 'includes', 'regex'].includes(check.kind)
    );

    if (hasComplexConstraints) {
      // Use constructive generation for complex multi-constraint strings
      return createConstructiveStringGenerator(def);
    }

    // Simple length-only constraints - use existing logic
    let minLength: number | undefined;
    let maxLength: number | undefined;

    for (const check of checks) {
      switch (check.kind) {
        case 'min':
          minLength = check.value;
          break;
        case 'max':
          maxLength = check.value;
          break;
        case 'length':
          minLength = maxLength = check.value;
          break;
      }
    }

    // Generate string with length constraints
    if (
      minLength !== undefined &&
      maxLength !== undefined &&
      minLength === maxLength
    ) {
      return Gen.stringOfLength(minLength).generator;
    }

    return Gen.sized((size) => {
      const actualMinLength = minLength ?? 0;
      const actualMaxLength = maxLength ?? size.get();
      const length = Math.min(
        actualMaxLength,
        Math.max(actualMinLength, size.get())
      );
      return Gen.stringOfLength(length);
    }).generator;
  }

  private buildNumberGenerator(def: any): GeneratorFn<number> {
    let min: number | undefined;
    let max: number | undefined;
    let multipleOf: number | undefined;
    let isInt = false;
    let finite = true;

    if (def.checks) {
      for (const check of def.checks) {
        switch (check.kind) {
          case 'min':
            min = check.value;
            break;
          case 'max':
            max = check.value;
            break;
          case 'int':
            isInt = true;
            break;
          case 'multipleOf':
            multipleOf = check.value;
            break;
          case 'finite':
            finite = true;
            break;
        }
      }
    }

    if (isInt) {
      const actualMin = min ?? Number.MIN_SAFE_INTEGER;
      const actualMax = max ?? Number.MAX_SAFE_INTEGER;
      const range = new Range(actualMin, actualMax);
      return Gen.int(range).generator;
    } else {
      const options: {
        min?: number;
        max?: number;
        multipleOf?: number;
        finite?: boolean;
        safe?: boolean;
      } = {};
      if (min !== undefined) options.min = min;
      if (max !== undefined) options.max = max;
      if (multipleOf !== undefined) options.multipleOf = multipleOf;
      options.finite = finite;
      options.safe = true;

      return Gen.number(options).generator;
    }
  }

  private buildBigIntGenerator(def: any): GeneratorFn<bigint> {
    let min: bigint | undefined;
    let max: bigint | undefined;
    let multipleOf: bigint | undefined;

    if (def.checks) {
      for (const check of def.checks) {
        switch (check.kind) {
          case 'min':
          case 'gte':
            min = BigInt(check.value);
            break;
          case 'max':
          case 'lte':
            max = BigInt(check.value);
            break;
          case 'multipleOf':
            multipleOf = BigInt(check.value);
            break;
        }
      }
    }

    return Gen.sized((size) => {
      const actualMin = min ?? BigInt(-1000000);
      const actualMax = max ?? BigInt(1000000);
      const range = Number(actualMax - actualMin);
      const clampedRange = Math.min(range, size.get() * 1000);

      return Gen.int(new Range(0, clampedRange)).map((n) => {
        let result = actualMin + BigInt(n);
        if (multipleOf && multipleOf !== 0n) {
          result = (result / multipleOf) * multipleOf;
        }
        return result;
      });
    }).generator;
  }

  private buildDateGenerator(def: any): GeneratorFn<Date> {
    let min: Date | undefined;
    let max: Date | undefined;

    if (def.checks) {
      for (const check of def.checks) {
        switch (check.kind) {
          case 'min':
            min = new Date(check.value);
            break;
          case 'max':
            max = new Date(check.value);
            break;
        }
      }
    }

    const options: { min?: Date; max?: Date } = {};
    if (min !== undefined) options.min = min;
    if (max !== undefined) options.max = max;

    return Gen.date(options).generator;
  }

  private buildSymbolGenerator(): GeneratorFn<symbol> {
    return Gen.oneOf([
      Gen.create(() => Tree.singleton(Symbol())),
      Gen.create(() => Tree.singleton(Symbol('test'))),
      Gen.create(() => Tree.singleton(Symbol('generated'))),
      Gen.create(() => Tree.singleton(Symbol.for('global'))),
    ]).generator;
  }

  private buildAnyGenerator(): GeneratorFn<any> {
    return Gen.oneOf<any>([
      Gen.string(),
      Gen.number(),
      Gen.bool(),
      Gen.create(() => Tree.singleton(null)),
      Gen.create(() => Tree.singleton(undefined)),
      Gen.array(Gen.string()),
      Gen.object({ key: Gen.string() }),
    ]).generator;
  }

  private buildUnknownGenerator(): GeneratorFn<unknown> {
    return this.buildAnyGenerator();
  }

  private buildArrayGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<unknown[]> {
    const elementType = def.type;
    const elementGen = new Gen(recurse(elementType, `${path}[*]`));

    let minLength: number | undefined;
    let maxLength: number | undefined;
    let exactLength: number | undefined;

    if (def.minLength !== null) {
      minLength = def.minLength.value;
    }
    if (def.maxLength !== null) {
      maxLength = def.maxLength.value;
    }
    if (def.exactLength !== null) {
      exactLength = def.exactLength.value;
    }

    if (exactLength !== undefined) {
      return Gen.arrayOfLength(elementGen, exactLength).generator;
    }

    const arrayOptions: { minLength?: number; maxLength?: number } = {};
    if (minLength !== undefined) arrayOptions.minLength = minLength;
    if (maxLength !== undefined) arrayOptions.maxLength = maxLength;

    return Gen.array(
      elementGen,
      Object.keys(arrayOptions).length > 0 ? arrayOptions : undefined
    ).generator;
  }

  private buildObjectGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<Record<string, unknown>> {
    const shape = def.shape();
    const generators: Record<string, Gen<unknown>> = {};

    for (const [key, schema] of Object.entries(shape)) {
      const gen = recurse(schema as z.ZodSchema<unknown>, `${path}.${key}`);
      generators[key] = new Gen(gen);
    }

    return Gen.object(generators).generator;
  }

  private buildUnionGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<unknown> {
    const options = def.options as z.ZodSchema<unknown>[];
    const generators = options.map(
      (schema, i) => new Gen(recurse(schema, `${path}[union:${i}]`))
    );

    return Gen.union(...generators).generator;
  }

  private buildOptionalGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<unknown> {
    const innerType = def.innerType;
    const innerGen = new Gen(recurse(innerType, `${path}?`));

    return Gen.optional(innerGen).generator;
  }

  private buildNullableGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<unknown> {
    const innerType = def.innerType;
    const innerGen = new Gen(recurse(innerType, `${path}|null`));

    return Gen.nullable(innerGen).generator;
  }

  private buildEnumGenerator(def: any): GeneratorFn<string> {
    const values = def.values as readonly [string, ...string[]];
    return Gen.enum(values).generator;
  }

  private buildLiteralGenerator(def: any): GeneratorFn<unknown> {
    const value = def.value;
    return Gen.literal(value).generator;
  }

  private buildTupleGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<unknown[]> {
    const items = def.items as z.ZodSchema<unknown>[];
    const generators = items.map(
      (schema, i) => new Gen(recurse(schema, `${path}[${i}]`))
    );

    return Gen.tuple(...generators).generator;
  }

  private buildRecordGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<Record<string, unknown>> {
    const valueType = def.valueType;
    const keyType = def.keyType;
    const valueGen = recurse(valueType, `${path}[value]`);

    if (keyType) {
      const keyGen = recurse(keyType, `${path}[key]`);

      return Gen.sized((size) => {
        const numKeys = Math.min(5, Math.max(1, Math.floor(size.get() / 10)));
        const generators: Record<string, Gen<unknown>> = {};

        for (let i = 0; i < numKeys; i++) {
          const keyTree = new Gen(keyGen).generate(size, Seed.fromNumber(i));
          const key = String(keyTree.value);
          generators[key] = new Gen(valueGen);
        }

        return Gen.object(generators);
      }).generator;
    } else {
      return Gen.sized((size) => {
        const numKeys = Math.min(5, Math.max(1, Math.floor(size.get() / 10)));
        const generators: Record<string, Gen<unknown>> = {};

        for (let i = 0; i < numKeys; i++) {
          generators[`key${i}`] = new Gen(valueGen);
        }

        return Gen.object(generators);
      }).generator;
    }
  }

  private buildMapGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<Map<unknown, unknown>> {
    const keyType = def.keyType;
    const valueType = def.valueType;
    const keyGen = new Gen(recurse(keyType, `${path}[mapKey]`));
    const valueGen = new Gen(recurse(valueType, `${path}[mapValue]`));

    return Gen.sized((size) => {
      const numEntries = Math.min(5, Math.max(1, Math.floor(size.get() / 10)));
      const entries: Array<[unknown, unknown]> = [];

      return Gen.create(() => {
        for (let i = 0; i < numEntries; i++) {
          const keyTree = keyGen.generate(size, Seed.fromNumber(i * 2));
          const valueTree = valueGen.generate(size, Seed.fromNumber(i * 2 + 1));
          entries.push([keyTree.value, valueTree.value]);
        }
        return Tree.singleton(new Map(entries));
      });
    }).generator;
  }

  private buildSetGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<Set<unknown>> {
    const elementType = def.valueType;
    const elementGen = new Gen(recurse(elementType, `${path}[setValue]`));

    let minSize: number | undefined;
    let maxSize: number | undefined;
    let exactSize: number | undefined;

    if (def.minSize !== null && def.minSize !== undefined) {
      minSize = def.minSize.value;
    }
    if (def.maxSize !== null && def.maxSize !== undefined) {
      maxSize = def.maxSize.value;
    }
    if (def.exactSize !== null && def.exactSize !== undefined) {
      exactSize = def.exactSize.value;
    }

    return Gen.sized((size) => {
      const actualMinSize = exactSize ?? minSize ?? 1;
      const actualMaxSize = exactSize ?? maxSize ?? Math.max(5, size.get());
      const setSize = Math.min(
        actualMaxSize,
        Math.max(actualMinSize, size.get())
      );

      return Gen.create(() => {
        const values = new Set<unknown>();
        let attempts = 0;
        const maxAttempts = setSize * 10; // Prevent infinite loops

        while (values.size < setSize && attempts < maxAttempts) {
          const tree = elementGen.generate(size, Seed.fromNumber(attempts));
          values.add(tree.value);
          attempts++;
        }

        return Tree.singleton(values);
      });
    }).generator;
  }

  private buildIntersectionGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<unknown> {
    const left = def.left;
    const right = def.right;

    // Get the generator functions directly, don't wrap in Gen
    const leftGeneratorFn = recurse(left, `${path}[left]`);
    const rightGeneratorFn = recurse(right, `${path}[right]`);

    return (size, seed) => {
      // For intersections, we merge the generated objects
      const [leftSeed, rightSeed] = seed.split();
      const leftTree = leftGeneratorFn(size, leftSeed);
      const rightTree = rightGeneratorFn(size, rightSeed);

      // Merge objects if both are objects
      if (
        typeof leftTree.value === 'object' &&
        leftTree.value !== null &&
        typeof rightTree.value === 'object' &&
        rightTree.value !== null
      ) {
        const merged = this.deepMerge(leftTree.value, rightTree.value);
        return Tree.singleton(merged);
      }

      // Otherwise return the right value (arbitrary choice)
      return rightTree;
    };
  }

  private buildDiscriminatedUnionGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<unknown> {
    const discriminator = def.discriminator;
    const options = def.options as z.ZodSchema<unknown>[];

    return Gen.create((size, seed) => {
      const [optionIndex] = seed.nextBounded(options.length);
      const selectedOption = options[optionIndex];
      const optionGen = new Gen(
        recurse(selectedOption, `${path}[${discriminator}:${optionIndex}]`)
      );
      return optionGen.generate(size, seed);
    }).generator;
  }

  private buildNativeEnumGenerator(def: any): GeneratorFn<unknown> {
    const enumObject = def.values;

    // For native enums, we need to extract the actual enum values
    // Numeric enums have both forward and reverse mapping
    const entries = Object.entries(enumObject);
    const validValues: unknown[] = [];

    // Check if this is a numeric enum by looking for numeric keys
    const hasNumericKeys = entries.some(([key]) => !isNaN(Number(key)));

    if (hasNumericKeys) {
      // Numeric enum: use the numeric values only
      for (const [key, value] of entries) {
        if (isNaN(Number(key))) {
          // This is a string key mapping to a number
          validValues.push(value);
        }
      }
    } else {
      // String enum: use all values
      validValues.push(...Object.values(enumObject));
    }

    return Gen.create((_size, seed) => {
      const [index] = seed.nextBounded(validValues.length);
      return Tree.singleton(validValues[index]);
    }).generator;
  }

  private buildFunctionGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<Function> {
    // Generate a simple function that returns a constant
    return Gen.create(() => {
      const mockFunction = () => {
        // Return a simple value based on the function signature
        if (def.returns) {
          const returnGen = new Gen(recurse(def.returns, `${path}[return]`));
          const returnTree = returnGen.generate(
            Size.of(10),
            Seed.fromNumber(42)
          );
          return returnTree.value;
        }
        return null;
      };
      return Tree.singleton(mockFunction);
    }).generator;
  }

  private buildLazyGenerator(
    def: any,
    recurse: Function,
    path: string
  ): GeneratorFn<unknown> {
    // For lazy types, we need to call the getter function and recurse
    return Gen.create((size, seed) => {
      try {
        const actualSchema = def.getter();
        const actualGen = new Gen(recurse(actualSchema, `${path}[lazy]`));
        return actualGen.generate(size, seed);
      } catch {
        // If the lazy evaluation fails, generate a simple object
        return Tree.singleton({});
      }
    }).generator;
  }

  /**
   * Deep merge two objects for intersection types
   */
  private deepMerge(left: any, right: any): any {
    // If either is not an object, return the right one
    if (
      typeof left !== 'object' ||
      left === null ||
      typeof right !== 'object' ||
      right === null
    ) {
      return right;
    }

    // Handle arrays by concatenating them
    if (Array.isArray(left) && Array.isArray(right)) {
      return [...left, ...right];
    }

    // If one is array and other is object, return the array
    if (Array.isArray(left) || Array.isArray(right)) {
      return Array.isArray(right) ? right : left;
    }

    // Deep merge objects
    const result: any = { ...left };

    for (const key in right) {
      if (Object.prototype.hasOwnProperty.call(right, key)) {
        if (key in result) {
          // Recursively merge if both have the same key
          result[key] = this.deepMerge(result[key], right[key]);
        } else {
          // Add new key from right
          result[key] = right[key];
        }
      }
    }

    return result;
  }
}
