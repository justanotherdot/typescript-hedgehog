/**
 * Basic Usage Examples for Hedgehog
 *
 * This file demonstrates the fundamental concepts of property-based testing
 * with the Hedgehog library. This file can be run directly, or used as a
 * reference for writing proper vitest tests.
 */

import { Gen, forAll, Config, Seed } from '@justanotherdot/hedgehog';

console.log('=== Hedgehog Basic Usage Examples ===\n');

// Example 1: Basic arithmetic property
console.log('Example 1: Basic arithmetic property');

const addZeroProperty = forAll(Gen.number(), (n) => {
  return n + 0 === n;
});

const result1 = addZeroProperty.run(
  Config.default().withTests(50),
  Seed.fromNumber(42)
);
console.log('Adding zero property:', result1.type === 'pass' ? 'PASSED' : 'FAILED');
console.log(`Tests run: ${result1.stats.testsRun}\n`);

// Example 2: Array reverse property (similar to actual tests)
console.log('Example 2: Array reverse property');

const reverseProperty = forAll(Gen.array(Gen.number()), (arr) => {
  const reversed = [...arr].reverse();
  const doubleReversed = [...reversed].reverse();
  return JSON.stringify(arr) === JSON.stringify(doubleReversed);
});

const result2 = reverseProperty.run(
  Config.default().withTests(100),
  Seed.fromNumber(42)
);
console.log('Reverse twice property:', result2.type === 'pass' ? 'PASSED' : 'FAILED');
console.log(`Tests run: ${result2.stats.testsRun}\n`);

// Example 3: Testing a function with constraints
console.log('Example 3: Testing with constraints');

function absolute(n: number): number {
  return n < 0 ? -n : n;
}

const absoluteProperty = forAll(Gen.number(), (n) => {
  return absolute(n) >= 0;
});

const result3 = absoluteProperty.run(
  Config.default().withTests(100),
  Seed.fromNumber(42)
);
console.log('Absolute value property:', result3.type === 'pass' ? 'PASSED' : 'FAILED');
console.log(`Tests run: ${result3.stats.testsRun}\n`);

// Example 4: Property with classification (like actual tests)
console.log('Example 4: Property with classification');

const classifiedProperty = forAll(Gen.int({ min: 0, max: 100 }), (x) => x >= 0)
  .classify('small', (x) => x < 25)
  .classify('medium', (x) => x >= 25 && x < 75)
  .classify('large', (x) => x >= 75);

const result4 = classifiedProperty.run(
  Config.default().withTests(100),
  Seed.fromNumber(42)
);
console.log('Classification property:', result4.type === 'pass' ? 'PASSED' : 'FAILED');
console.log('Labels collected:');
for (const [label, count] of result4.stats.labels) {
  console.log(`  ${label}: ${count} occurrences`);
}
console.log('');

// Example 5: Sort property with proper testing structure
console.log('Example 5: Sort property');

const sortProperty = forAll(Gen.array(Gen.int({ min: 1, max: 100 })), (arr) => {
  const sorted = [...arr].sort((a, b) => a - b);

  // Same length
  if (sorted.length !== arr.length) return false;

  // Actually sorted
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] < sorted[i - 1]) return false;
  }

  return true;
});

const result5 = sortProperty.run(
  Config.default().withTests(100),
  Seed.fromNumber(42)
);
console.log('Sort property:', result5.type === 'pass' ? 'PASSED' : 'FAILED');
console.log(`Tests run: ${result5.stats.testsRun}\n`);

// Example 6: Custom configuration
console.log('Example 6: Custom configuration');

const customConfig = Config.default()
  .withTests(25)
  .withShrinks(500)
  .withSizeLimit(50);

const configProperty = forAll(Gen.number(), (x) => typeof x === 'number');
const result6 = configProperty.run(customConfig, Seed.fromNumber(42));

console.log('Custom config property:', result6.type === 'pass' ? 'PASSED' : 'FAILED');
console.log(`Tests run: ${result6.stats.testsRun}\n`);

console.log('=== Vitest Integration ===');
console.log('To use these patterns in vitest tests:');
console.log('');
console.log('import { describe, test, expect } from "vitest";');
console.log('import { Gen, forAll, Config, Seed } from "@justanotherdot/hedgehog";');
console.log('');
console.log('describe("My property tests", () => {');
console.log('  test("array reverse property", () => {');
console.log('    const prop = forAll(Gen.array(Gen.number()), (arr) => {');
console.log('      const reversed = [...arr].reverse().reverse();');
console.log('      return JSON.stringify(arr) === JSON.stringify(reversed);');
console.log('    });');
console.log('');
console.log('    const result = prop.run(');
console.log('      Config.default().withTests(100),');
console.log('      Seed.fromNumber(42)');
console.log('    );');
console.log('');
console.log('    expect(result.type).toBe("pass");');
console.log('  });');
console.log('});');
console.log('');

console.log('All basic examples completed!');