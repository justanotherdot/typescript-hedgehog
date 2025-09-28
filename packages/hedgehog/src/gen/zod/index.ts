/**
 * Zod integration for Hedgehog
 *
 * This module provides Zod schema integration for property-based testing.
 * It requires Zod to be installed as a peer dependency.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { Gen } from '@justanotherdot/hedgehog';
 * import { fromSchema } from '@justanotherdot/hedgehog/zod';
 *
 * const userSchema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 * });
 *
 * const userGen = fromSchema(userSchema);
 * ```
 */

// Note: This module requires Zod to be installed
// If zod is not available, imports will fail with a clear error message

// Export zod integration features
export { fromSchema, createCustomRegistry } from './core/zod.js';
export { defaultRegistry } from './core/strategy.js';
export type {
  ZodGenerationError,
  ZodGenerationStrategy,
  ZodGenerationRegistry,
  ZodGenerationContext,
} from './core/strategy.js';
