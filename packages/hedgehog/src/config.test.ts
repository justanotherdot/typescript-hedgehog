import { describe, test, expect } from 'vitest';
import { Config } from './config.js';

describe('Config', () => {
  test('creates default configuration', () => {
    const config = Config.default();
    expect(config.testLimit).toBe(100);
    expect(config.shrinkLimit).toBe(1000);
    expect(config.sizeLimit).toBe(100);
    expect(config.discardLimit).toBe(100);
  });

  test('creates config with custom test limit', () => {
    const config = Config.default().withTests(50);
    expect(config.testLimit).toBe(50);
    expect(config.shrinkLimit).toBe(1000); // Others unchanged
  });

  test('creates config with custom shrink limit', () => {
    const config = Config.default().withShrinks(500);
    expect(config.shrinkLimit).toBe(500);
    expect(config.testLimit).toBe(100); // Others unchanged
  });

  test('creates config with custom size limit', () => {
    const config = Config.default().withSizeLimit(50);
    expect(config.sizeLimit).toBe(50);
    expect(config.testLimit).toBe(100); // Others unchanged
  });

  test('creates config with custom discard limit', () => {
    const config = Config.default().withDiscardLimit(200);
    expect(config.discardLimit).toBe(200);
    expect(config.testLimit).toBe(100); // Others unchanged
  });

  test('configuration edge cases', () => {
    // Zero limits should be allowed (though may not be practical)
    const zeroConfig = Config.default()
      .withTests(0)
      .withShrinks(0)
      .withSizeLimit(0)
      .withDiscardLimit(0);

    expect(zeroConfig.testLimit).toBe(0);
    expect(zeroConfig.shrinkLimit).toBe(0);
    expect(zeroConfig.sizeLimit).toBe(0);
    expect(zeroConfig.discardLimit).toBe(0);

    // Very large limits should work
    const largeConfig = Config.default()
      .withTests(1000000)
      .withShrinks(1000000)
      .withSizeLimit(1000000)
      .withDiscardLimit(1000000);

    expect(largeConfig.testLimit).toBe(1000000);
    expect(largeConfig.shrinkLimit).toBe(1000000);
    expect(largeConfig.sizeLimit).toBe(1000000);
    expect(largeConfig.discardLimit).toBe(1000000);
  });

  test('config toString representation', () => {
    const config = Config.default();
    const str = config.toString();
    expect(str).toContain('tests: 100');
    expect(str).toContain('shrinks: 1000');
    expect(str).toContain('size: 100');
    expect(str).toContain('discards: 100');
  });

  test('config chaining preserves immutability', () => {
    const original = Config.default();
    const modified = original.withTests(50).withShrinks(200);

    // Original should be unchanged
    expect(original.testLimit).toBe(100);
    expect(original.shrinkLimit).toBe(1000);

    // Modified should have new values
    expect(modified.testLimit).toBe(50);
    expect(modified.shrinkLimit).toBe(200);
    expect(modified.sizeLimit).toBe(100); // Unchanged
    expect(modified.discardLimit).toBe(100); // Unchanged
  });
});
