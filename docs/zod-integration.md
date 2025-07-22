# Zod Integration Guide

This guide explains how to use Hedgehog's powerful Zod integration for property-based testing with automatic value generation from Zod schemas.

## Quick Start

```typescript
import { z } from 'zod';
import { Gen } from 'hedgehog';

// Define your schema
const userSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(18).max(120).optional(),
});

// Generate test data automatically
const userGen = Gen.fromSchema(userSchema);
const testUser = userGen.sample();
// { id: 42, name: "generated-string", email: "user123@example.com", age: 25 }
```

## Architecture Overview

The Zod integration uses a **hybrid strategy system** that automatically selects the best generation approach:

### Strategy Hierarchy (Priority Order)

1. **PatternStrategy** (Priority: 100) - High-quality generators for common patterns
2. **ConstraintStrategy** (Priority: 50) - Basic type generation with constraints  
3. **FilterStrategy** (Priority: 1) - Generate-and-filter fallback

### How Strategy Selection Works

```typescript
const emailSchema = z.string().email();
// → Uses PatternStrategy (generates realistic emails)

const numberSchema = z.number().min(0).max(100);
// → Uses ConstraintStrategy (generates numbers in range)

const complexSchema = z.string().refine(val => isPrime(val.length));
// → Uses FilterStrategy (generates strings, filters by prime length)
```

## Supported Zod Types

### ✅ Fully Supported

| Category | Types | Generation Strategy |
|----------|-------|-------------------|
| **Primitives** | `string`, `number`, `boolean`, `bigint`, `date`, `symbol` | Constraint |
| **Literals** | `literal`, `null`, `undefined`, `void`, `nan`, `any`, `unknown` | Constraint |
| **Strings** | `email`, `url`, `uuid`, `datetime`, `ip`, `cidr`, `emoji`, etc. | Pattern |
| **String IDs** | `nanoid`, `cuid`, `cuid2`, `ulid`, `jwt` | Pattern |
| **Encoding** | `base64`, `base64url` | Pattern |
| **Collections** | `array`, `tuple`, `object`, `record`, `map`, `set` | Constraint |
| **Unions** | `union`, `discriminatedUnion` | Constraint |
| **Advanced** | `intersection`, `function`, `lazy`, `nativeEnum`, `promise` | Constraint |
| **Modifiers** | `optional`, `nullable`, `default`, `catch`, `brand` | Constraint |
| **Refinements** | `refine`, `superRefine`, `transform`, `preprocess` | Filter |

### ⚠️ Fallback Support

| Type | Behavior |
|------|----------|
| `never` | Throws error (cannot generate impossible values) |
| Complex regex | Uses FilterStrategy (may be slow for restrictive patterns) |
| Deep refinements | May timeout if constraints are too restrictive |

## Generation Strategies Explained

### 1. PatternStrategy - Smart Pattern Recognition

Generates high-quality, realistic data for common patterns:

```typescript
// Email generation
z.string().email()
// → "user42@example.com", "admin123@test.org"

// UUID generation  
z.string().uuid()
// → "123e4567-e89b-12d3-a456-426614174000"

// JWT generation
z.string().jwt()
// → "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0..."
```

**When it's used:** Single string validations with known patterns (`email`, `url`, `uuid`, etc.)

### 2. ConstraintStrategy - Type + Constraints

Handles basic types with validation constraints:

```typescript
// Number with constraints
z.number().int().min(0).max(100)
// → 42, 17, 83

// String with length
z.string().min(5).max(20)
// → "generated-string", "hello-world"

// Object composition
z.object({ name: z.string(), age: z.number() })
// → { name: "test", age: 25 }
```

**When it's used:** Basic types with simple constraints that can be generated constructively.

### 3. FilterStrategy - Generate and Filter

Falls back to generating values and filtering until valid:

```typescript
// Complex string refinement
z.string().refine(s => isPrime(s.length))
// → Generates strings, keeps only those with prime lengths

// Combined constraints that don't have constructive solutions
z.string().email().refine(email => email.includes('admin'))
// → Generates emails, keeps only those containing 'admin'
```

**When it's used:** Complex refinements, transforms, or when other strategies can't handle the schema.

## Customization and Overrides

### Basic Override System

Override specific schema instances with custom generators:

```typescript
import { createCustomRegistry } from 'hedgehog/zod';

const emailSchema = z.string().email();
const registry = createCustomRegistry()
  .override(emailSchema, Gen.constant('admin@company.com').generator);

const gen = registry.fromSchema(emailSchema);
gen.sample(); // Always "admin@company.com"
```

### Custom Strategy Registration

Create entirely new strategies for specialized needs:

```typescript
import { ZodGenerationStrategy, ZodGenerationContext } from 'hedgehog/zod';

class DatabaseIdStrategy implements ZodGenerationStrategy {
  readonly name = 'DatabaseIdStrategy';
  readonly priority = 150; // Higher than PatternStrategy

  canHandle(context: ZodGenerationContext): boolean {
    // Check if schema represents a database ID
    return isDbIdSchema(context.schema);
  }

  build(context: ZodGenerationContext): GeneratorFn<string> {
    return Gen.choose(1, 1000000)
      .map(n => `db_${n.toString().padStart(8, '0')}`)
      .generator;
  }
}

const registry = createCustomRegistry()
  .register(new DatabaseIdStrategy());
```

### Graceful Degradation

Handle unsupported schemas gracefully instead of crashing:

```typescript
const registry = createCustomRegistry()
  .enableGracefulFallback();

// If someNewZodFeature() isn't supported yet:
const schema = z.object({
  name: z.string(),           // ✅ Works normally
  special: z.someNewZodFeature(), // ⚠️ Gets fallback value
});

const gen = registry.fromSchema(schema);
const result = gen.sample();
// { name: "generated-string", special: "fallback-string-special" }
```

See [Graceful Degradation Guide](./graceful-degradation.md) for details.

## Advanced Usage Patterns

### Property-Based Testing

```typescript
import { property, assert } from 'hedgehog';

const userSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(0).max(150),
});

property('user serialization roundtrip', Gen.fromSchema(userSchema), (user) => {
  const serialized = JSON.stringify(user);
  const deserialized = JSON.parse(serialized);
  return userSchema.safeParse(deserialized).success;
});

assert(property, { tests: 100 });
```

### Schema Evolution Testing

```typescript
// Test that new schema versions can parse old data
const userV1 = z.object({
  name: z.string(),
  age: z.number(),
});

const userV2 = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email().optional(), // New field
});

property('schema evolution', Gen.fromSchema(userV1), (oldUser) => {
  // Old data should parse with new schema
  return userV2.safeParse(oldUser).success;
});
```

### API Contract Testing

```typescript
const requestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  path: z.string().regex(/^\/api\/\w+/),
  headers: z.record(z.string()),
  body: z.unknown().optional(),
});

const responseSchema = z.object({
  status: z.number().int().min(200).max(599),
  data: z.unknown(),
  headers: z.record(z.string()),
});

property('API contract', Gen.fromSchema(requestSchema), (request) => {
  const response = simulateApiCall(request);
  return responseSchema.safeParse(response).success;
});
```

## Performance Considerations

### Strategy Performance Profile

| Strategy | Speed | Quality | Use Case |
|----------|-------|---------|----------|
| PatternStrategy | ⚡ Fast | ⭐⭐⭐ Excellent | Known patterns |
| ConstraintStrategy | ⚡ Fast | ⭐⭐ Good | Basic constraints |
| FilterStrategy | 🐌 Slow | ⭐ Variable | Complex refinements |

### Optimization Tips

1. **Prefer pattern-based schemas** when possible:
   ```typescript
   // ✅ Fast - uses PatternStrategy
   z.string().email()
   
   // ❌ Slow - uses FilterStrategy
   z.string().refine(s => /^[^@]+@[^@]+\.[^@]+$/.test(s))
   ```

2. **Use constructive constraints** instead of refinements:
   ```typescript
   // ✅ Fast - constructive generation
   z.number().min(0).max(100)
   
   // ❌ Slow - generate-and-filter
   z.number().refine(n => n >= 0 && n <= 100)
   ```

3. **Override slow schemas** for testing:
   ```typescript
   const slowSchema = z.string().refine(expensiveValidation);
   
   const registry = createCustomRegistry()
     .override(slowSchema, Gen.string().generator);
   ```

## Error Handling and Debugging

### Detailed Error Messages

Errors include full path information for complex schemas:

```typescript
const schema = z.object({
  user: z.object({
    profile: z.object({
      avatar: z.string().someUnsupportedMethod(),
    }),
  }),
});

// Error: "No strategy available for Zod schema type: ZodSomeUnsupported 
//         at path 'user.profile.avatar'. Available strategies: 
//         PatternStrategy, ConstraintStrategy, FilterStrategy"
```

### Strategy Debugging

Get information about which strategy handles a schema:

```typescript
import { getStrategyInfo } from 'hedgehog/zod';

const info = getStrategyInfo(z.string().email());
console.log(info);
// {
//   strategyName: 'PatternStrategy',
//   canHandle: [true, false, false],
//   path: ''
// }
```

### Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Filter strategy failed after 100 attempts" | Constraints too restrictive | Use `.override()` or simplify schema |
| "No strategy available" | Unsupported schema type | Enable graceful degradation or add custom strategy |
| Slow generation | Complex refinements | Override with simpler generator for testing |
| Invalid generated data | Bug in generator | Report issue with schema example |

## Migration from Other Tools

### From fast-check

```typescript
// fast-check
import * as fc from 'fast-check';
const userArb = fc.record({
  name: fc.string(),
  age: fc.integer(0, 120),
});

// Hedgehog + Zod
const userSchema = z.object({
  name: z.string(),
  age: z.number().int().min(0).max(120),
});
const userGen = Gen.fromSchema(userSchema);
```

### From manual generators

```typescript
// Manual generator
const emailGen = Gen.string()
  .map(s => `${s}@example.com`)
  .filter(email => email.length < 50);

// Zod schema (automatic generator)
const emailSchema = z.string().email().max(50);
const emailGen = Gen.fromSchema(emailSchema);
```

## Best Practices

### 1. Schema Design for Testing

```typescript
// ✅ Good - specific, testable constraints
const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(13).max(120),
  role: z.enum(['user', 'admin', 'moderator']),
});

// ❌ Avoid - vague constraints
const userSchema = z.object({
  id: z.string(), // Too vague
  name: z.string().refine(isValidName), // Opaque validation
  email: z.string().refine(email => email.includes('@')), // Reinventing email validation
});
```

### 2. Layered Testing Strategy

```typescript
// 1. Schema validation tests (fast)
property('user schema validation', Gen.fromSchema(userSchema), (user) => {
  return userSchema.safeParse(user).success;
});

// 2. Business logic tests (medium)
property('user business rules', Gen.fromSchema(userSchema), (user) => {
  return validateUserBusinessRules(user);
});

// 3. Integration tests (slow, fewer cases)
property('user API integration', Gen.fromSchema(userSchema), (user) => {
  return testUserApiEndpoint(user);
});
```

### 3. Override Strategy

```typescript
// Use overrides for:
// - Slow schemas in development
// - Specific test scenarios
// - External dependencies

const registry = createCustomRegistry()
  // Fast development
  .override(expensiveSchema, Gen.constant(mockValue).generator)
  // Specific scenarios
  .override(userSchema, Gen.constant(adminUser).generator)
  // External dependencies
  .override(apiResponseSchema, Gen.constant(mockResponse).generator);
```

## Contributing

The Zod integration is extensible and we welcome contributions:

1. **Pattern Generators** - Add support for new string patterns
2. **Strategies** - Implement new generation approaches
3. **Schema Support** - Add support for new Zod features
4. **Performance** - Optimize existing generators

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup and guidelines.

## Resources

- [Graceful Degradation Guide](./graceful-degradation.md) - Handling unsupported schemas
- [Performance Analysis](./performance-analysis.md) - Benchmarks and optimization
- [Zod Documentation](https://zod.dev) - Official Zod schema documentation
- [Property-Based Testing Guide](./property-based-testing.md) - Testing strategies and patterns