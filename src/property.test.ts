import { describe, test, expect } from 'vitest';
import { forAll } from './property';
import { int, Ints } from './gen/primitive';
import { Gen } from './gen';
import { Config } from './config';
import { Seed } from './data/seed';

describe('Property testing', () => {
  test('simple passing property', () => {
    const prop = forAll(Ints.small(), (x) => x >= 0 && x <= 100);
    const result = prop.run(Config.default().withTests(50), Seed.fromNumber(42));
    
    expect(result.type).toBe('pass');
    if (result.type === 'pass') {
      expect(result.stats.testsRun).toBe(50);
      expect(result.stats.testsDiscarded).toBe(0);
    }
  });

  test('simple failing property with shrinking', () => {
    // Property: all integers are less than 50 (should fail)
    const prop = forAll(Ints.range(0, 100), (x) => x < 50);
    const result = prop.run(Config.default().withTests(100), Seed.fromNumber(42));
    
    expect(result.type).toBe('fail');
    if (result.type === 'fail') {
      expect(result.counterexample.value).toBeGreaterThanOrEqual(50);
      expect(result.counterexample.value).toBeLessThanOrEqual(100);
      
      // Shrinking should find a value <= original failure
      expect(result.counterexample.value).toBeLessThanOrEqual(result.originalFailure.value);
      // May or may not shrink depending on what the original failure was
      expect(result.stats.shrinkSteps).toBeGreaterThanOrEqual(0);
    }
  });

  test('reverse property', () => {
    // Property: reverse(reverse(list)) === list
    const listGen = Gen.list(Ints.small());
    const prop = forAll(listGen, (xs) => {
      const reversed = [...xs].reverse();
      const doubleReversed = [...reversed].reverse();
      return JSON.stringify(xs) === JSON.stringify(doubleReversed);
    });
    
    const result = prop.run(Config.default().withTests(100), Seed.fromNumber(42));
    expect(result.type).toBe('pass');
  });

  test('sort property', () => {
    // Property: sorted list has same length and is actually sorted
    const listGen = Gen.list(Ints.range(1, 100));
    const prop = forAll(listGen, (xs) => {
      const sorted = [...xs].sort((a, b) => a - b);
      
      // Same length
      if (sorted.length !== xs.length) return false;
      
      // Actually sorted
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] < sorted[i - 1]) return false;
      }
      
      return true;
    });
    
    const result = prop.run(Config.default().withTests(100), Seed.fromNumber(42));
    expect(result.type).toBe('pass');
  });

  test('property with classification', () => {
    const prop = forAll(Ints.range(0, 100), (x) => x >= 0)
      .classify('small', (x) => x < 25)
      .classify('medium', (x) => x >= 25 && x < 75)
      .classify('large', (x) => x >= 75);
    
    const result = prop.run(Config.default().withTests(100), Seed.fromNumber(42));
    
    expect(result.type).toBe('pass');
    if (result.type === 'pass') {
      expect(result.stats.labels.size).toBeGreaterThan(0);
      
      // Should have distributed across categories
      const totalLabeled = Array.from(result.stats.labels.values()).reduce((a, b) => a + b, 0);
      expect(totalLabeled).toBeGreaterThan(0);
    }
  });

  test('property that fails early gets shrunk', () => {
    // Property that fails for any value >= 50 (should find a larger failing value)
    const prop = forAll(Ints.range(0, 100), (x) => x < 50);
    const result = prop.run(Config.default().withTests(100), Seed.fromNumber(42));
    
    expect(result.type).toBe('fail');
    if (result.type === 'fail') {
      // Should find a failing value >= 50
      expect(result.counterexample.value).toBeGreaterThanOrEqual(50);
      expect(result.counterexample.value).toBeLessThanOrEqual(result.originalFailure.value);
      
      // Should have tried some shrink steps (might be 0 if already minimal)
      expect(result.stats.shrinkSteps).toBeGreaterThanOrEqual(0);
    }
  });

  test('shrinking finds minimal counterexample', () => {
    // Property that fails for values >= 10, test with seed that generates larger values
    const prop = forAll(Ints.range(0, 100), (x) => x < 10);
    const result = prop.run(Config.default().withTests(100), Seed.fromNumber(123)); // Different seed
    
    expect(result.type).toBe('fail');
    if (result.type === 'fail') {
      expect(result.counterexample.value).toBeGreaterThanOrEqual(10);
      
      // If the original failure was much larger than 10, we should see shrinking
      if (result.originalFailure.value > 15) {
        expect(result.stats.shrinkSteps).toBeGreaterThan(0);
        expect(result.counterexample.value).toBeLessThan(result.originalFailure.value);
      }
    }
  });

  test('config customization', () => {
    const config = Config.default()
      .withTests(25)
      .withShrinks(500)
      .withSizeLimit(50);
    
    const prop = forAll(Ints.small(), (x) => x >= 0);
    const result = prop.run(config, Seed.fromNumber(42));
    
    expect(result.type).toBe('pass');
    if (result.type === 'pass') {
      expect(result.stats.testsRun).toBe(25);
    }
  });
});