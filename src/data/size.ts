/**
 * Size parameter for controlling test data generation.
 *
 * Size typically ranges from 0 to 100, where larger values
 * generate more complex test data.
 */
export class Size {
  constructor(readonly value: number) {
    if (value < 0) {
      throw new Error('Size must be non-negative');
    }
  }

  static of(value: number): Size {
    return new Size(value);
  }

  get(): number {
    return this.value;
  }

  /**
   * Scale size by a factor.
   */
  scale(factor: number): Size {
    return new Size(Math.floor(this.value * factor));
  }

  /**
   * Clamp size to a maximum value.
   */
  clamp(max: number): Size {
    return new Size(Math.min(this.value, max));
  }

  /**
   * Golden ratio progression for size scaling.
   */
  golden(): Size {
    return new Size(Math.floor(this.value * 0.61803398875));
  }

  toString(): string {
    return `Size(${this.value})`;
  }
}

/**
 * Distribution shapes for value generation within ranges.
 */
export enum Distribution {
  /** Uniform distribution across the range. */
  Uniform = 'uniform',
  /** Linear distribution favoring smaller values. */
  Linear = 'linear',
  /** Exponential distribution strongly favoring smaller values. */
  Exponential = 'exponential',
  /** Constant distribution (always generates the same value). */
  Constant = 'constant',
}

/**
 * A range for generating numeric values with enhanced shrinking.
 */
export class Range<T extends number = number> {
  constructor(
    public readonly min: T,
    public readonly max: T,
    public readonly origin: T | null = null,
    public readonly distribution: Distribution = Distribution.Uniform
  ) {
    if (min > max) {
      throw new Error('Range min must be <= max');
    }
  }

  /**
   * Create a new range with the given bounds and uniform distribution.
   */
  static uniform(min: number, max: number): Range<number> {
    return new Range(min, max, null, Distribution.Uniform);
  }

  /**
   * Create a linear range that favors smaller values.
   */
  static linear(min: number, max: number): Range<number> {
    return new Range(min, max, null, Distribution.Linear);
  }

  /**
   * Create an exponential range that strongly favors smaller values.
   */
  static exponential(min: number, max: number): Range<number> {
    return new Range(min, max, null, Distribution.Exponential);
  }

  /**
   * Create a constant range that always generates the same value.
   */
  static constant(value: number): Range<number> {
    return new Range(value, value, value, Distribution.Constant);
  }

  /**
   * Set the origin point for shrinking.
   */
  withOrigin(origin: number): Range<number> {
    return new Range(this.min, this.max, origin, this.distribution);
  }

  /**
   * Check if a value is within this range.
   */
  contains(value: number): boolean {
    return value >= this.min && value <= this.max;
  }

  /**
   * Get the range size.
   */
  size(): number {
    return this.max - this.min;
  }
}

/**
 * Predefined ranges for common use cases.
 */
export const Ranges = {
  /** Create a positive range [1, Number.MAX_SAFE_INTEGER] with linear distribution. */
  positive: (): Range<number> =>
    Range.linear(1, Number.MAX_SAFE_INTEGER).withOrigin(1),

  /** Create a natural range [0, Number.MAX_SAFE_INTEGER] with linear distribution. */
  natural: (): Range<number> =>
    Range.linear(0, Number.MAX_SAFE_INTEGER).withOrigin(0),

  /** Create a small positive range [1, 100] with uniform distribution. */
  smallPositive: (): Range<number> => Range.uniform(1, 100).withOrigin(1),

  /** Create a unit range [0.0, 1.0] with uniform distribution. */
  unit: (): Range<number> => Range.uniform(0.0, 1.0).withOrigin(0.0),

  /** Create a standard normal-like range [-3.0, 3.0] with uniform distribution. */
  normal: (): Range<number> => Range.uniform(-3.0, 3.0).withOrigin(0),
} as const;
