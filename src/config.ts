/**
 * Configuration for property testing.
 */
export class Config {
  constructor(
    /** Maximum number of tests to run. */
    public readonly testLimit: number = 100,
    /** Maximum number of shrinks to attempt when a test fails. */
    public readonly shrinkLimit: number = 1000,
    /** Maximum size parameter to use for generation. */
    public readonly sizeLimit: number = 100,
    /** Maximum number of discards before giving up (for filtered generators). */
    public readonly discardLimit: number = 100
  ) {}

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
    return new Config(tests, this.shrinkLimit, this.sizeLimit, this.discardLimit);
  }

  /**
   * Create a new config with the given shrink limit.
   */
  withShrinks(shrinks: number): Config {
    return new Config(this.testLimit, shrinks, this.sizeLimit, this.discardLimit);
  }

  /**
   * Create a new config with the given size limit.
   */
  withSizeLimit(size: number): Config {
    return new Config(this.testLimit, this.shrinkLimit, size, this.discardLimit);
  }

  /**
   * Create a new config with the given discard limit.
   */
  withDiscardLimit(discards: number): Config {
    return new Config(this.testLimit, this.shrinkLimit, this.sizeLimit, discards);
  }

  toString(): string {
    return `Config(tests: ${this.testLimit}, shrinks: ${this.shrinkLimit}, size: ${this.sizeLimit}, discards: ${this.discardLimit})`;
  }
}