/**
 * Strategy pattern for Zod schema generation.
 *
 * This module implements a layered architecture to contain complexity:
 * - Strategy interface defines the contract
 * - Specific strategies handle different Zod schema types
 * - Registry manages strategy selection and fallbacks
 */

import { z } from 'zod';
import { GeneratorFn } from '@/gen/core.js';
import { constant } from '@/gen/generators.js';

/**
 * Context object passed to strategies containing schema information and generation state.
 */
export interface ZodGenerationContext {
  /** The Zod schema to generate for */
  schema: z.ZodSchema<any>;
  /** Path to this schema (for error reporting) */
  path: string;
  /** Recursion function for nested schemas */
  recurse: (schema: z.ZodSchema<any>, path: string) => GeneratorFn<any>;
}

/**
 * Strategy interface for generating values from Zod schemas.
 */
export interface ZodGenerationStrategy {
  /**
   * Check if this strategy can handle the given schema.
   * Should be fast as it's called for every schema.
   */
  canHandle(context: ZodGenerationContext): boolean;

  /**
   * Generate a generator function for the schema.
   * Only called if canHandle returns true.
   */
  build(context: ZodGenerationContext): GeneratorFn<any>;

  /** Strategy name for debugging and error reporting */
  readonly name: string;

  /** Priority for strategy selection (higher = checked first) */
  readonly priority: number;
}

/**
 * Error thrown when no strategy can handle a schema.
 */
export class ZodGenerationError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly schema: z.ZodSchema<any>
  ) {
    super(`${message} at path '${path}'`);
    this.name = 'ZodGenerationError';
  }
}

/**
 * Registry manages strategy selection and provides the main generation interface.
 */
export class ZodGenerationRegistry {
  private strategies: ZodGenerationStrategy[] = [];
  private overrides = new Map<z.ZodSchema<any>, GeneratorFn<any>>();
  private enableGracefulDegradation = false;

  /**
   * Register a strategy. Strategies are checked in priority order (highest first).
   */
  register(strategy: ZodGenerationStrategy): this {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => b.priority - a.priority);
    return this;
  }

  /**
   * Override generation for a specific schema instance.
   * This takes priority over all strategies.
   */
  override<T>(schema: z.ZodSchema<T>, generator: GeneratorFn<T>): this {
    this.overrides.set(schema, generator);
    return this;
  }

  /**
   * Enable graceful degradation mode.
   * When enabled, unsupported schemas generate safe fallback values instead of throwing.
   */
  enableGracefulFallback(enabled = true): this {
    this.enableGracefulDegradation = enabled;
    return this;
  }

  /**
   * Build a generator for the given schema.
   * First checks for overrides, then tries strategies in priority order.
   */
  build<T>(schema: z.ZodSchema<T>, path: string = ''): GeneratorFn<T> {
    // Check for schema-specific override first
    const override = this.overrides.get(schema);
    if (override) {
      return override as GeneratorFn<T>;
    }

    const context: ZodGenerationContext = {
      schema,
      path,
      recurse: (nestedSchema, nestedPath) =>
        this.build(nestedSchema, nestedPath),
    };

    for (const strategy of this.strategies) {
      if (strategy.canHandle(context)) {
        try {
          return strategy.build(context) as GeneratorFn<T>;
        } catch {
          // Strategy failed, try next one
          continue;
        }
      }
    }

    if (this.enableGracefulDegradation) {
      // Generate a safe fallback value based on schema type
      return this.createGracefulFallback(schema, path) as GeneratorFn<T>;
    }

    // Provide more detailed error information
    const schemaType = (schema as any)._def?.typeName || 'unknown';
    const availableStrategies = this.strategies.map((s) => s.name).join(', ');

    throw new ZodGenerationError(
      `No strategy available for Zod schema type: ${schemaType} at path '${path}'. Available strategies: ${availableStrategies}`,
      path,
      schema
    );
  }

  /**
   * Get all registered strategies (for debugging).
   */
  getStrategies(): readonly ZodGenerationStrategy[] {
    return [...this.strategies];
  }

  /**
   * Create a safe fallback generator for unsupported schema types.
   * Returns reasonable default values to prevent test failures.
   */
  private createGracefulFallback(
    schema: z.ZodSchema<any>,
    path: string
  ): GeneratorFn<any> {
    const schemaType = (schema as any)._def?.typeName;

    // Use direct generator function to avoid circular dependency with Gen class

    switch (schemaType) {
      case 'ZodString':
        return constant(
          `fallback-string-${path.replace(/[^a-zA-Z0-9]/g, '-')}`
        );
      case 'ZodNumber':
        return constant(0);
      case 'ZodBoolean':
        return constant(false);
      case 'ZodArray':
        return constant([]);
      case 'ZodObject':
        return constant({});
      case 'ZodDate':
        return constant(new Date('2020-01-01'));
      case 'ZodBigInt':
        return constant(0n);
      case 'ZodNull':
        return constant(null);
      case 'ZodUndefined':
        return constant(undefined);
      default:
        // For unknown types, return null as a safe fallback
        return constant(null);
    }
  }
}

/**
 * Default registry instance - strategies will be registered here.
 */
export const defaultRegistry = new ZodGenerationRegistry();
