/**
 * Hybrid Zod schema integration using layered strategy pattern.
 *
 * This module implements the new architecture:
 * - PatternStrategy: High-quality generators for common patterns
 * - ConstraintStrategy: Basic type generation with constraints
 * - FilterStrategy: Generate-and-filter fallback for everything else
 */

import { z } from 'zod';
import { Gen } from '@/gen.js';
import { defaultRegistry } from './strategy.js';
import { PatternStrategy } from '../strategies/pattern-strategy.js';
import { ConstraintStrategy } from '../strategies/constraint-strategy.js';
import { FilterStrategy } from '../strategies/filter-strategy.js';

// Register strategies in priority order
defaultRegistry
  .register(new PatternStrategy()) // Highest priority - specific patterns
  .register(new ConstraintStrategy()) // Medium priority - basic constraints
  .register(new FilterStrategy()); // Lowest priority - fallback

/**
 * Create a generator from a Zod schema using the hybrid strategy approach.
 *
 * This function automatically selects the best generation strategy:
 * 1. Pattern-based generation for common cases (email, UUID, etc.)
 * 2. Constraint-based generation for basic types with simple constraints
 * 3. Generate-and-filter fallback for complex schemas
 *
 * @param schema - The Zod schema to convert to a generator
 * @returns A generator that produces values of the schema's type
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { Gen } from 'hedgehog';
 *
 * const userSchema = z.object({
 *   id: z.number().int().positive(),
 *   name: z.string().min(1).max(100),
 *   email: z.string().email(),  // Uses PatternStrategy
 *   age: z.number().int().min(0).max(120).optional()  // Uses ConstraintStrategy
 * });
 *
 * const userGen = Gen.fromSchema(userSchema);
 * ```
 */
export function fromSchema<T>(schema: z.ZodSchema<T>): Gen<T> {
  const generatorFn = defaultRegistry.build(schema);
  return new Gen(generatorFn);
}

/**
 * Create a custom registry with override capabilities.
 * Supports both strategy registration and schema-specific overrides.
 *
 * @example
 * ```typescript
 * import { createCustomRegistry } from './zod.js';
 * import { Gen } from '../../gen.js';
 *
 * // Method 1: Override specific schema instances
 * const emailSchema = z.string().email();
 * const customRegistry = createCustomRegistry()
 *   .override(emailSchema, Gen.constant('test@example.com').generator);
 *
 * // Method 2: Register custom strategies
 * class CustomUserStrategy implements ZodGenerationStrategy {
 *   canHandle(context) { return isUserSchema(context.schema); }
 *   build(context) { return generateRealisticUser(); }
 * }
 *
 * customRegistry.register(new CustomUserStrategy());
 * const userGen = customRegistry.fromSchema(userSchema);
 * ```
 */
export function createCustomRegistry() {
  const registry = new (defaultRegistry.constructor as any)();

  // Register default strategies
  registry
    .register(new PatternStrategy())
    .register(new ConstraintStrategy())
    .register(new FilterStrategy());

  const api = {
    register: (strategy: any) => {
      registry.register(strategy);
      return api;
    },

    override: <T>(schema: z.ZodSchema<T>, generator: any) => {
      registry.override(schema, generator);
      return api;
    },

    enableGracefulFallback: (enabled = true) => {
      registry.enableGracefulFallback(enabled);
      return api;
    },

    fromSchema: <T>(schema: z.ZodSchema<T>): Gen<T> => {
      const generatorFn = registry.build(schema);
      return new Gen(generatorFn);
    },
  };

  return api;
}

/**
 * Get diagnostic information about strategy selection.
 * Useful for debugging and understanding which strategy is being used.
 */
export function getStrategyInfo(schema: z.ZodSchema<any>): {
  strategyName: string;
  canHandle: boolean[];
  path: string;
} {
  const strategies = defaultRegistry.getStrategies();
  const context = {
    schema,
    path: '',
    recurse: () => {
      throw new Error('Diagnostic mode - no recursion');
    },
  };

  const canHandle = strategies.map((strategy) => strategy.canHandle(context));
  const selectedStrategy = strategies.find((strategy) =>
    strategy.canHandle(context)
  );

  return {
    strategyName: selectedStrategy?.name || 'None',
    canHandle,
    path: '',
  };
}

// Re-export strategy classes for advanced usage
export { PatternStrategy } from '../strategies/pattern-strategy.js';
export { ConstraintStrategy } from '../strategies/constraint-strategy.js';
export { FilterStrategy } from '../strategies/filter-strategy.js';
export {
  ZodGenerationStrategy,
  ZodGenerationContext,
  ZodGenerationError,
  ZodGenerationRegistry,
} from './strategy.js';
