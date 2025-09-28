/**
 * Advanced Configuration Examples for Hedgehog
 *
 * This file demonstrates advanced usage of Config, seeds, and property
 * testing techniques.
 */

import { Gen, forAll, Config, Seed } from '@justanotherdot/hedgehog';

console.log('=== Advanced Configuration Examples ===\n');

// Example 1: Custom test configuration
console.log('=== Example 1: Custom Test Counts ===\n');

const simpleProperty = forAll(Gen.number(), (n) => typeof n === 'number');

// Run with different test counts
console.log('Running with 10 tests:');
const smallConfig = Config.default().withTests(10);
const result1 = simpleProperty.run(smallConfig);
console.log(`Result: ${result1.type}, Tests run: ${result1.stats.testsRun}`);

console.log('\nRunning with 1000 tests:');
const largeConfig = Config.default().withTests(1000);
const result2 = simpleProperty.run(largeConfig);
console.log(`Result: ${result2.type}, Tests run: ${result2.stats.testsRun}`);

// Example 2: Using seeds for reproducible tests
console.log('\n=== Example 2: Reproducible Tests with Seeds ===\n');

const randomProperty = forAll(Gen.array(Gen.number()), (arr) => arr.length >= 0);

// Use the same seed for reproducible results
const fixedSeed = Seed.fromNumber(42);

console.log('First run with seed 42:');
const reproducibleResult1 = randomProperty.run(Config.default().withTests(5), fixedSeed);
console.log(`Tests run: ${reproducibleResult1.stats.testsRun}`);

console.log('\nSecond run with same seed 42:');
const reproducibleResult2 = randomProperty.run(Config.default().withTests(5), fixedSeed);
console.log(`Tests run: ${reproducibleResult2.stats.testsRun}`);
console.log('Both runs should generate identical test cases!');

// Example 3: Testing with size limits
console.log('\n=== Example 3: Size Control ===\n');

// Property that depends on generated data size
const sizeAwareProperty = forAll(Gen.array(Gen.string()), (arr) => {
  console.log(`Generated array of length: ${arr.length}`);
  return arr.length >= 0; // Always true, just showing size effects
});

console.log('Small size limit (10):');
const smallSizeConfig = Config.default().withTests(5).withSizeLimit(10);
sizeAwareProperty.run(smallSizeConfig);

console.log('\nLarge size limit (100):');
const largeSizeConfig = Config.default().withTests(5).withSizeLimit(100);
sizeAwareProperty.run(largeSizeConfig);

// Example 4: Property classification and labeling
console.log('\n=== Example 4: Property Classification ===\n');

const classifiedProperty = forAll(Gen.number({ min: -100, max: 100 }), (n) => {
  return Math.abs(n) === Math.abs(n); // Always true
})
.classify('positive', (n) => n > 0)
.classify('negative', (n) => n < 0)
.classify('zero', (n) => n === 0)
.classify('large', (n) => Math.abs(n) > 50);

const classifiedResult = classifiedProperty.run(Config.default().withTests(100));
console.log('Classification result:', classifiedResult.type);
console.log('Labels collected:');
for (const [label, count] of classifiedResult.stats.labels) {
  console.log(`  ${label}: ${count} occurrences`);
}

// Example 5: Testing for failure cases
console.log('\n=== Example 5: Expecting Failures ===\n');

// This property should fail - demonstrating shrinking
const failingProperty = forAll(Gen.array(Gen.number()), (arr) => {
  // This will fail for non-empty arrays
  return arr.length === 0;
});

const failureResult = failingProperty.run(Config.default().withTests(50));
console.log('Expected failure result:', failureResult.type);
if (failureResult.type === 'fail') {
  console.log('Counterexample found:', failureResult.counterexample?.value);
  console.log('Shrink steps:', failureResult.stats.shrinkSteps);
}

// Example 6: Custom shrink limits
console.log('\n=== Example 6: Shrink Control ===\n');

const shrinkTestProperty = forAll(Gen.array(Gen.number(), { minLength: 1 }), (arr) => {
  // Fail if sum is greater than 100
  return arr.reduce((sum, n) => sum + Math.abs(n), 0) <= 100;
});

// Test with different shrink limits
console.log('High shrink limit (1000):');
const highShrinkConfig = Config.default().withTests(100).withShrinks(1000);
const shrinkResult1 = shrinkTestProperty.run(highShrinkConfig);
if (shrinkResult1.type === 'fail') {
  console.log(`Shrink steps: ${shrinkResult1.stats.shrinkSteps}`);
  console.log('Final counterexample:', shrinkResult1.counterexample?.value);
}

console.log('\nLow shrink limit (10):');
const lowShrinkConfig = Config.default().withTests(100).withShrinks(10);
const shrinkResult2 = shrinkTestProperty.run(lowShrinkConfig);
if (shrinkResult2.type === 'fail') {
  console.log(`Shrink steps: ${shrinkResult2.stats.shrinkSteps}`);
  console.log('Final counterexample:', shrinkResult2.counterexample?.value);
}

console.log('\nAdvanced configuration examples completed!');