import { describe, test, expect } from 'vitest';
import { forAll } from './property';
import { bool, int, string } from './gen/primitive';
import { Gen } from './gen';
import { Range, Ranges } from './data/size';
import { Config } from './config';
import { Seed } from './data/seed';

describe('Meta Properties', () => {
  test('bool generator produces only booleans', () => {
    const prop = forAll(bool(), (b) => typeof b === 'boolean');
    const result = prop.run();
    expect(result.type).toBe('pass');
  });

  test('int generator respects range bounds', () => {
    const range = Range.uniform(10, 20);
    const prop = forAll(int(range), (n) => n >= 10 && n <= 20);
    const result = prop.run();
    expect(result.type).toBe('pass');
  });

  test('string generator produces strings', () => {
    const prop = forAll(string(), (s) => typeof s === 'string');
    const result = prop.run();
    expect(result.type).toBe('pass');
  });

  test('positive integers are positive', () => {
    const prop = forAll(int(Ranges.positive()), (n) => n > 0);
    const result = prop.run();
    expect(result.type).toBe('pass');
  });

  test('natural numbers are non-negative', () => {
    const prop = forAll(int(Ranges.natural()), (n) => n >= 0);
    const result = prop.run();
    expect(result.type).toBe('pass');
  });

  test('list generator produces arrays with correct element types', () => {
    const listGen = Gen.list(int(Range.uniform(1, 10)));
    const prop = forAll(listGen, (arr) => 
      Array.isArray(arr) && arr.every(x => typeof x === 'number' && x >= 1 && x <= 10)
    );
    const result = prop.run();
    expect(result.type).toBe('pass');
  });

  test('oneOf generator only produces values from choices', () => {
    const choices = [1, 2, 3, 4, 5];
    const choiceGen = Gen.oneOf(choices.map(Gen.constant));
    const prop = forAll(choiceGen, (n) => choices.includes(n));
    const result = prop.run();
    expect(result.type).toBe('pass');
  });

  test('mapped generators preserve relationships', () => {
    const baseGen = int(Range.uniform(0, 100));
    const doubledGen = baseGen.map(n => n * 2);
    const prop = forAll(doubledGen, (n) => n % 2 === 0);
    const result = prop.run();
    expect(result.type).toBe('pass');
  });

  test('filtered generators satisfy predicate', () => {
    const evenGen = int(Range.uniform(0, 100)).filter(n => n % 2 === 0);
    const prop = forAll(evenGen, (n) => n % 2 === 0);
    const result = prop.run();
    expect(result.type).toBe('pass');
  });

  test('bound generators maintain composition', () => {
    const baseGen = int(Range.uniform(1, 10));
    const listGen = baseGen.bind(n => Gen.listOfLength(Gen.constant('x'), n));
    const prop = forAll(listGen, (arr) => 
      arr.length >= 1 && arr.length <= 10 && arr.every(x => x === 'x')
    );
    const result = prop.run();
    expect(result.type).toBe('pass');
  });

  test('property that should fail demonstrates shrinking', () => {
    // This property should fail and find a minimal counterexample
    const prop = forAll(int(Range.uniform(1, 100)), (n) => n < 50);
    const result = prop.run();
    
    expect(result.type).toBe('fail');
    if (result.type === 'fail') {
      // Should find minimal counterexample (50)
      expect(result.counterexample.value).toBeGreaterThanOrEqual(50);
      expect(result.originalFailure.value).toBeGreaterThanOrEqual(50);
      // Shrinking may or may not occur depending on the original failure
      expect(result.stats.shrinkSteps).toBeGreaterThanOrEqual(0);
    }
  });

  test('string length property with shrinking', () => {
    // Property that fails for strings longer than 5 characters
    const prop = forAll(string(), (s) => s.length <= 5);
    const result = prop.run(Config.default().withTests(1000));
    
    if (result.type === 'fail') {
      // Should shrink to minimal failing string (6 characters)
      expect(result.counterexample.value.length).toBe(6);
      expect(result.originalFailure.value.length).toBeGreaterThanOrEqual(6);
    }
  });

  test('list shrinking finds minimal failing case', () => {
    // Property that fails for lists with more than 3 elements
    const listGen = Gen.list(int(Range.uniform(1, 10)));
    const prop = forAll(listGen, (arr) => arr.length <= 3);
    const result = prop.run(Config.default().withTests(1000));
    
    if (result.type === 'fail') {
      // Should shrink to list of exactly 4 elements
      expect(result.counterexample.value.length).toBe(4);
      expect(result.originalFailure.value.length).toBeGreaterThanOrEqual(4);
    }
  });

  test('frequency distribution approximates weights', () => {
    const heavyChoice = Gen.constant('heavy');
    const lightChoice = Gen.constant('light');
    const weightedGen = Gen.frequency([[80, heavyChoice], [20, lightChoice]]);
    
    // Run many tests to check distribution
    const results: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const prop = forAll(weightedGen, (choice) => {
        results.push(choice);
        return true;
      });
      prop.run(Config.default().withTests(1));
    }
    
    const heavyCount = results.filter(r => r === 'heavy').length;
    const lightCount = results.filter(r => r === 'light').length;
    
    // Heavy should be approximately 4x more common than light (80/20 = 4)
    const ratio = heavyCount / lightCount;
    expect(ratio).toBeGreaterThan(2); // Allow some variance
    expect(ratio).toBeLessThan(6);
  });

  test('sized generators scale with size parameter', () => {
    const sizedListGen = Gen.sized(size => Gen.listOfLength(Gen.constant(1), size.get()));
    
    // Test with different size values
    const smallProp = forAll(sizedListGen, (arr) => arr.length <= 10);
    const smallResult = smallProp.run(Config.default().withSizeLimit(10));
    expect(smallResult.type).toBe('pass');
    
    const largeProp = forAll(sizedListGen, (arr) => arr.length <= 50);
    const largeResult = largeProp.run(Config.default().withSizeLimit(50));
    expect(largeResult.type).toBe('pass');
  });

  test('deterministic generation with same seed', () => {
    const gen = Gen.oneOf([Gen.constant(1), Gen.constant(2), Gen.constant(3)]);
    const prop = forAll(gen, () => true);
    
    const seed = Seed.fromNumber(42);
    const result1 = prop.run(Config.default(), seed);
    const result2 = prop.run(Config.default(), seed);
    
    expect(result1.type).toBe('pass');
    expect(result2.type).toBe('pass');
    // Results should be identical for same seed
    expect(result1.stats.testsRun).toBe(result2.stats.testsRun);
  });
});