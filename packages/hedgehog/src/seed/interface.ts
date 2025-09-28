/**
 * Common interface for all SplitMix64 seed implementations.
 *
 * This ensures consistency between BigInt, WASM, and Adaptive implementations,
 * making them interchangeable for users while maintaining type safety.
 */

export interface Seed {
  // Core properties
  readonly state: bigint;
  readonly gamma: bigint;

  // Single-value generation methods
  nextBool(): [boolean, Seed];
  nextBounded(bound: number): [number, Seed];
  nextUint32(): [number, Seed];
  nextFloat(): [number, Seed];

  // Seed management
  split(): [Seed, Seed];
  toString(): string;

  // Implementation introspection (optional - may not be available on all implementations)
  getImplementation?(): string;
}

/**
 * Extended interface for seeds that support bulk operations.
 * This allows implementations to provide optimized batching without
 * breaking compatibility with the basic Seed interface.
 */
export interface BulkSeed extends Seed {
  // Bulk generation methods
  nextBools(count: number): { values: boolean[]; finalSeed: BulkSeed };
  nextBoundedBulk(
    count: number,
    bound: number
  ): { values: number[]; finalSeed: BulkSeed };

  // Performance introspection
  getPerformanceInfo?(): {
    implementation: string;
    batchingAvailable: boolean;
    recommendedForBulkOps: boolean;
  };
}

/**
 * Static constructor interface that all seed implementations should follow.
 * This allows for consistent creation patterns across implementations.
 */
export interface SeedStatic<T extends Seed> {
  fromNumber(value: number): T;
  random(): T;
}

/**
 * Type guard to check if a seed supports bulk operations.
 */
export function supportsBulkOperations(seed: Seed): seed is BulkSeed {
  return 'nextBools' in seed && typeof (seed as any).nextBools === 'function';
}

/**
 * Type guard to check if a seed provides implementation info.
 */
export function providesImplementationInfo(
  seed: Seed
): seed is Seed & { getImplementation(): string } {
  return (
    'getImplementation' in seed &&
    typeof (seed as any).getImplementation === 'function'
  );
}
