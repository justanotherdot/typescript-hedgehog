# Graceful Degradation in Zod Integration

## What is Graceful Degradation?

**Graceful degradation** is a feature that allows the Zod integration to handle unsupported or complex schema types by generating safe fallback values instead of throwing errors and stopping test execution.

## The Problem

Without graceful degradation:

```typescript
import { z } from 'zod';
import { Gen } from 'hedgehog';

// Imagine this uses a very new Zod feature not yet supported
const complexSchema = z.someNewZodFeature().complex().chain(...);

// This would throw an error and stop your entire test suite
const gen = Gen.fromSchema(complexSchema); // ❌ ZodGenerationError: No strategy available
```

## The Solution

With graceful degradation enabled:

```typescript
import { createCustomRegistry } from 'hedgehog/zod';

const registry = createCustomRegistry()
  .enableGracefulFallback(); // Enable graceful degradation

// Now this generates a safe fallback value instead of crashing
const gen = registry.fromSchema(complexSchema); // ✅ Generates reasonable default
const value = gen.sample(); // Returns something like "fallback-string-root" or {}
```

## When to Use Graceful Degradation

### ✅ **Good Use Cases:**

1. **Testing legacy codebases** - When you have complex schemas but want to start property-based testing immediately
2. **Partial migration** - When migrating from other testing tools and need tests to keep running
3. **Rapid prototyping** - When you want to test the "happy path" first and refine schema support later
4. **Large team environments** - When different developers add schemas faster than generator support can be implemented
5. **CI/CD stability** - When you prioritize test suite stability over perfect schema coverage

### ❌ **When NOT to Use:**

1. **Production validation** - Fallback values won't catch real validation bugs
2. **Complete test coverage** - You miss edge cases with specific schema constraints
3. **New projects** - Better to implement proper support from the start

## How It Works

The system provides reasonable default values based on the Zod schema type:

| Zod Type | Fallback Value | Example |
|----------|----------------|---------|
| `ZodString` | `"fallback-string-{path}"` | `"fallback-string-user-name"` |
| `ZodNumber` | `0` | `0` |
| `ZodBoolean` | `false` | `false` |
| `ZodArray` | `[]` | `[]` |
| `ZodObject` | `{}` | `{}` |
| `ZodDate` | `new Date('2020-01-01')` | `2020-01-01T00:00:00.000Z` |
| `ZodBigInt` | `0n` | `0n` |
| `ZodNull` | `null` | `null` |
| `ZodUndefined` | `undefined` | `undefined` |
| Unknown types | `null` | `null` |

## Path-Based Error Reporting

Even with graceful degradation disabled, the system provides detailed error context:

```typescript
// Instead of generic errors:
// ❌ "No strategy available"

// You get detailed path information:
// ✅ "No strategy available for Zod schema type: ZodCustomType at path 'user.profile.settings.advanced'. Available strategies: PatternStrategy, ConstraintStrategy, FilterStrategy"
```

This helps you:
- **Pinpoint exactly** which part of a complex schema needs attention
- **Understand available strategies** for debugging
- **Prioritize implementation** of missing schema support

## Examples

### Basic Usage

```typescript
import { z } from 'zod';
import { createCustomRegistry } from 'hedgehog/zod';

const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),        // ✅ Supported - uses PatternStrategy
  metadata: z.someNewFeature(),     // ❌ Unsupported
});

// Without graceful degradation (default)
const strictRegistry = createCustomRegistry();
try {
  const gen = strictRegistry.fromSchema(userSchema);
} catch (error) {
  console.log(error.message);
  // "No strategy available for Zod schema type: ZodSomeNewFeature at path 'metadata'"
}

// With graceful degradation
const gracefulRegistry = createCustomRegistry()
  .enableGracefulFallback();

const gen = gracefulRegistry.fromSchema(userSchema);
const user = gen.sample();
// {
//   name: "generated-string",
//   email: "test@example.com", 
//   metadata: null  // Safe fallback
// }
```

### Temporary Override for Specific Cases

```typescript
const schema = z.object({
  id: z.string().cuid2(),           // ❌ Say this isn't supported yet
  data: z.string().email(),         // ✅ This works fine
});

const registry = createCustomRegistry()
  .enableGracefulFallback()
  // Override just the problematic schema with better value
  .override(
    z.string().cuid2(), 
    Gen.constant('cjld2cjxh0000qzrmn831i7rn').generator
  );

const gen = registry.fromSchema(schema);
const result = gen.sample();
// {
//   id: "cjld2cjxh0000qzrmn831i7rn",  // Custom override
//   data: "user123@example.com"        // Normal generation
// }
```

## Best Practices

### 1. **Gradual Improvement**
```typescript
// Start with graceful degradation for rapid testing
const registry = createCustomRegistry()
  .enableGracefulFallback();

// Gradually add proper support for specific schemas
registry.override(criticalSchema, properGenerator);
```

### 2. **Monitor Fallback Usage**
```typescript
// Log when fallbacks are used to track missing support
const registry = createCustomRegistry()
  .enableGracefulFallback()
  .override(z.string().unknownFormat(), (size, seed) => {
    console.warn('Using fallback for unknownFormat at', path);
    return Gen.constant('fallback-value').generator;
  });
```

### 3. **Test Both Modes**
```typescript
// Test with graceful degradation for coverage
const gracefulTests = () => {
  const registry = createCustomRegistry().enableGracefulFallback();
  // ... run property tests
};

// Test without for validation
const strictTests = () => {
  const registry = createCustomRegistry();
  // ... ensure all schemas are properly supported
};
```

## Performance Considerations

- **Minimal overhead** - Graceful degradation only activates when schemas fail
- **No runtime cost** - When all schemas are supported, performance is identical
- **Memory efficient** - Fallback generators are simple constants

## Migration Strategy

1. **Phase 1**: Enable graceful degradation, run existing tests
2. **Phase 2**: Identify frequently used fallbacks via logging
3. **Phase 3**: Implement proper generators for high-priority schemas
4. **Phase 4**: Gradually disable graceful degradation for stricter validation
5. **Phase 5**: Full schema support with detailed error reporting

This approach lets you get the benefits of property-based testing immediately while building robust schema support over time.