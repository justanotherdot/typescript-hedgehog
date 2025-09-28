/**
 * Generate-and-filter fallback strategy for complex Zod schemas.
 *
 * This strategy handles cases that other strategies can't handle by
 * generating base values and filtering them through Zod validation.
 * It's the fallback of last resort but handles 100% of Zod schemas.
 */

import { z } from 'zod';
import { Gen } from '@/gen.js';
import {
  ZodGenerationStrategy,
  ZodGenerationContext,
  ZodGenerationError,
} from '../core/strategy.js';
import { GeneratorFn } from '@/gen/core.js';
import { Range } from '@/data/size.js';
import { Tree } from '@/data/tree.js';

/**
 * Fallback strategy that uses generate-and-filter for any schema.
 * Lowest priority - only used when other strategies can't handle the schema.
 */
export class FilterStrategy implements ZodGenerationStrategy {
  readonly name = 'FilterStrategy';
  readonly priority = 1; // Lowest priority - fallback only

  canHandle(context: ZodGenerationContext): boolean {
    // Only handle schemas we can actually generate base values for
    const { schema } = context;

    // Check if we have a base generator for this type
    try {
      this.getBaseGenerator(schema);
      return true;
    } catch {
      // If we can't generate a base value, let graceful degradation handle it
      return false;
    }
  }

  build(context: ZodGenerationContext): GeneratorFn<any> {
    const { schema, path } = context;

    // Get base generator for the schema type
    const baseGen = this.getBaseGenerator(schema);

    // Create filtered generator
    return this.createFilteredGenerator(baseGen, schema, path);
  }

  /**
   * Get a base generator that produces values of roughly the right type.
   */
  private getBaseGenerator(schema: z.ZodSchema<any>): Gen<any> {
    const def = (schema as any)._def;
    const typeName = def?.typeName;

    // Handle effects/transforms by getting base schema
    if (typeName === z.ZodFirstPartyTypeKind.ZodEffects) {
      return this.getBaseGenerator(def.schema);
    }

    // Handle other wrapper types
    if (typeName === z.ZodFirstPartyTypeKind.ZodOptional) {
      return Gen.optional(this.getBaseGenerator(def.innerType));
    }

    if (typeName === z.ZodFirstPartyTypeKind.ZodNullable) {
      return Gen.nullable(this.getBaseGenerator(def.innerType));
    }

    // Base type generators
    switch (typeName) {
      case z.ZodFirstPartyTypeKind.ZodString:
        return Gen.string();

      case z.ZodFirstPartyTypeKind.ZodNumber:
        return Gen.number();

      case z.ZodFirstPartyTypeKind.ZodBigInt:
        return Gen.sized((_size) =>
          Gen.int(new Range(-1000, 1000)).map((n) => BigInt(n))
        );

      case z.ZodFirstPartyTypeKind.ZodBoolean:
        return Gen.bool();

      case z.ZodFirstPartyTypeKind.ZodDate:
        return Gen.date();

      case z.ZodFirstPartyTypeKind.ZodArray: {
        const elementGen = this.getBaseGenerator(def.type);
        return Gen.array(elementGen);
      }

      case z.ZodFirstPartyTypeKind.ZodObject: {
        const shape = def.shape();
        const generators: Record<string, Gen<unknown>> = {};
        for (const [key, subSchema] of Object.entries(shape)) {
          generators[key] = this.getBaseGenerator(
            subSchema as z.ZodSchema<unknown>
          );
        }
        return Gen.object(generators);
      }

      case z.ZodFirstPartyTypeKind.ZodUnion: {
        const options = def.options as z.ZodSchema<unknown>[];
        const unionGens = options.map((option) =>
          this.getBaseGenerator(option)
        );
        return Gen.union(...unionGens);
      }

      case z.ZodFirstPartyTypeKind.ZodEnum:
        return Gen.enum(def.values);

      case z.ZodFirstPartyTypeKind.ZodLiteral:
        return Gen.literal(def.value);

      case z.ZodFirstPartyTypeKind.ZodTuple: {
        const items = def.items as z.ZodSchema<unknown>[];
        const tupleGens = items.map((item) => this.getBaseGenerator(item));
        return Gen.tuple(...tupleGens);
      }

      case z.ZodFirstPartyTypeKind.ZodRecord: {
        const valueGen = this.getBaseGenerator(def.valueType);
        return Gen.sized(() =>
          Gen.object({
            key1: valueGen,
            key2: valueGen,
            key3: valueGen,
          })
        );
      }

      // Simple literals
      case z.ZodFirstPartyTypeKind.ZodUndefined:
        return Gen.create(() => Tree.singleton(undefined));

      case z.ZodFirstPartyTypeKind.ZodNull:
        return Gen.create(() => Tree.singleton(null));

      case z.ZodFirstPartyTypeKind.ZodVoid:
        return Gen.create(() => Tree.singleton(undefined));

      case z.ZodFirstPartyTypeKind.ZodNaN:
        return Gen.constant(NaN);

      case z.ZodFirstPartyTypeKind.ZodAny:
      case z.ZodFirstPartyTypeKind.ZodUnknown:
        return Gen.oneOf<any>([
          Gen.string(),
          Gen.number(),
          Gen.bool(),
          Gen.create(() => Tree.singleton(null)),
          Gen.create(() => Tree.singleton(undefined)),
        ]);

      default:
        // For unsupported types, try generating common values
        return Gen.oneOf<any>([
          Gen.string(),
          Gen.number(),
          Gen.bool(),
          Gen.create(() => Tree.singleton(null)),
          Gen.create(() => Tree.singleton(undefined)),
          Gen.array(Gen.string()),
          Gen.object({ key: Gen.string() }),
        ]);
    }
  }

  /**
   * Create a generator that filters base values through Zod validation.
   */
  private createFilteredGenerator(
    baseGen: Gen<any>,
    schema: z.ZodSchema<any>,
    path: string
  ): GeneratorFn<any> {
    const maxAttempts = 100;
    let attempts = 0;
    let successCount = 0;

    return (size, seed) => {
      attempts = 0;
      successCount = 0;

      while (attempts < maxAttempts) {
        attempts++;

        // Generate a candidate value
        const tree = baseGen.generate(size, seed);
        const parseResult = schema.safeParse(tree.value);

        if (parseResult.success) {
          successCount++;
          // Return the parsed value (handles transforms)
          return tree.map(() => parseResult.data);
        }

        // Try with a different seed
        const [, newSeed] = seed.split();
        seed = newSeed;
      }

      // Calculate success rate for error reporting
      const successRate = successCount / attempts;

      throw new ZodGenerationError(
        `Filter strategy failed after ${maxAttempts} attempts (${(successRate * 100).toFixed(1)}% success rate). ` +
          `Schema constraints may be too restrictive.`,
        path,
        schema
      );
    };
  }
}
