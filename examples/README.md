# Hedgehog Examples

This directory contains comprehensive examples demonstrating various features and use cases of the Hedgehog property-based testing library.

## Running the Examples

```bash
# Install dependencies
npm install

# Run a specific example
npx tsx examples/basic-usage.ts
npx tsx examples/advanced-config.ts
npx tsx examples/zod-integration.ts  # Requires: npm install zod
```

## Examples Overview

### [basic-usage.ts](./basic-usage.ts)
**Start here!** Demonstrates fundamental concepts:
- Basic property testing with numbers, strings, arrays, booleans
- Testing simple functions (like absolute value)
- Using different generator types
- Creating objects with multiple properties

### [advanced-config.ts](./advanced-config.ts)
**Configuration and control:**
- Custom test counts and size limits
- Reproducible tests with seeds
- Property classification and labeling
- Shrinking behavior and limits
- Handling expected failures

### [zod-integration.ts](./zod-integration.ts)
**Schema-driven testing:**
- Generating data from Zod schemas
- Complex nested objects and arrays
- Union types and discriminated unions
- API testing with request/response schemas
- Constraint validation

## Key Concepts Demonstrated

### Property Testing Basics
```typescript
// Properties are statements that should hold for all inputs
const property = forAll(Gen.number(), (n) => {
  return Math.abs(n) >= 0; // Always true
});

// Run with configuration
const result = property.run(new Config(100));
console.log(result.type === 'pass' ? 'PASSED' : 'FAILED');
```

### Configuration
```typescript
// Control test behavior
const config = new Config(100)          // 100 test cases
  .withSizeLimit(50)                    // Max size for generated data
  .withShrinks(500)                     // Max shrink attempts on failure
  .withDiscardLimit(200);               // Max discards before giving up
```

### Reproducibility
```typescript
// Use seeds for reproducible test runs
const seed = Seed.fromNumber(42);
const result1 = property.run(config, seed);
const result2 = property.run(config, seed); // Identical results
```

### Schema Integration
```typescript
// Generate from Zod schemas
import { fromSchema } from '@justanotherdot/hedgehog/zod';

const userGen = fromSchema(z.object({
  name: z.string(),
  age: z.number().min(0).max(120)
}));
```

## Tips for Effective Property Testing

1. **Start Simple**: Begin with basic properties before moving to complex scenarios
2. **Think in Properties**: Ask "what should always be true?" rather than "what are some test cases?"
3. **Use Classification**: Label your test data to understand coverage
4. **Embrace Failures**: Failed properties often reveal edge cases you hadn't considered
5. **Leverage Shrinking**: When tests fail, examine the minimal counterexample

## Common Patterns

### Testing Functions
```typescript
// Test mathematical properties
forAll(Gen.number(), (n) => Math.round(n) === Math.round(n));

// Test transformations
forAll(Gen.string(), (s) => s.toUpperCase().toLowerCase() === s.toLowerCase());
```

### Testing Data Structures
```typescript
// Test invariants
forAll(Gen.array(Gen.number()), (arr) => {
  const sorted = [...arr].sort();
  return sorted.length === arr.length;
});
```

### API Testing
```typescript
// Test with generated requests
forAll(requestGenerator, (request) => {
  const response = apiHandler(request);
  return responseSchema.safeParse(response).success;
});
```