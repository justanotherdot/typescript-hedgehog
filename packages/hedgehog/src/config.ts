/**
 * Configuration for property testing.
 */
export class Config {
  constructor(
    configOrTestLimit?:
      | { testLimit?: number; shrinkLimit?: number; sizeLimit?: number; discardLimit?: number }
      | number,
    shrinkLimit: number = 1000,
    sizeLimit: number = 100,
    discardLimit: number = 100
  ) {
    if (typeof configOrTestLimit === 'object' && configOrTestLimit !== null) {
      // Object-style constructor
      this.testLimit = configOrTestLimit.testLimit ?? 100;
      this.shrinkLimit = configOrTestLimit.shrinkLimit ?? 1000;
      this.sizeLimit = configOrTestLimit.sizeLimit ?? 100;
      this.discardLimit = configOrTestLimit.discardLimit ?? 100;
    } else {
      // Parameter-style constructor
      this.testLimit = configOrTestLimit ?? 100;
      this.shrinkLimit = shrinkLimit;
      this.sizeLimit = sizeLimit;
      this.discardLimit = discardLimit;
    }
  }

  /** Maximum number of tests to run. */
  public readonly testLimit: number;
  /** Maximum number of shrinks to attempt when a test fails. */
  public readonly shrinkLimit: number;
  /** Maximum size parameter to use for generation. */
  public readonly sizeLimit: number;
  /** Maximum number of discards before giving up (for filtered generators). */
  public readonly discardLimit: number;

  /**
   * Create the default configuration.
   */
  static default(): Config {
    return new Config();
  }

  /**
   * Create a new config with the given number of tests.
   */
  withTests(tests: number): Config {
    return new Config(
      tests,
      this.shrinkLimit,
      this.sizeLimit,
      this.discardLimit
    );
  }

  /**
   * Create a new config with the given shrink limit.
   */
  withShrinks(shrinks: number): Config {
    return new Config(
      this.testLimit,
      shrinks,
      this.sizeLimit,
      this.discardLimit
    );
  }

  /**
   * Create a new config with the given size limit.
   */
  withSizeLimit(size: number): Config {
    return new Config(
      this.testLimit,
      this.shrinkLimit,
      size,
      this.discardLimit
    );
  }

  /**
   * Create a new config with the given discard limit.
   */
  withDiscardLimit(discards: number): Config {
    return new Config(
      this.testLimit,
      this.shrinkLimit,
      this.sizeLimit,
      discards
    );
  }

  toString(): string {
    return `Config(tests: ${this.testLimit}, shrinks: ${this.shrinkLimit}, size: ${this.sizeLimit}, discards: ${this.discardLimit})`;
  }
}
