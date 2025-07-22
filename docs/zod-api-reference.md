# Zod Integration API Reference

Complete API documentation for Hedgehog's Zod integration.

## Core Functions

### `Gen.fromSchema<T>(schema: ZodSchema<T>): Gen<T>`

Creates a generator from a Zod schema using the default registry.

```typescript
import { z } from 'zod';
import { Gen } from 'hedgehog';

const userSchema = z.object({
  name: z.string(),
  age: z.number(),
});

const gen = Gen.fromSchema(userSchema);
const user = gen.sample(); // { name: "...", age: 42 }
```

### `createCustomRegistry(): CustomRegistry`

Creates a new registry with override and strategy registration capabilities.

```typescript
import { createCustomRegistry } from 'hedgehog/zod';

const registry = createCustomRegistry()
  .override(schema, generator)
  .register(strategy)
  .enableGracefulFallback();
```

## Registry API

### `CustomRegistry`

#### Methods

##### `override<T>(schema: ZodSchema<T>, generator: GeneratorFn<T>): CustomRegistry`

Override generation for a specific schema instance.

**Parameters:**
- `schema` - The exact schema instance to override
- `generator` - Generator function to use instead

**Returns:** The registry for chaining

**Example:**
```typescript
const emailSchema = z.string().email();
const registry = createCustomRegistry()
  .override(emailSchema, Gen.constant('test@example.com').generator);
```

##### `register(strategy: ZodGenerationStrategy): CustomRegistry`

Register a custom generation strategy.

**Parameters:**
- `strategy` - Strategy implementing `ZodGenerationStrategy` interface

**Returns:** The registry for chaining

**Example:**
```typescript
class MyStrategy implements ZodGenerationStrategy {
  readonly name = 'MyStrategy';
  readonly priority = 75;
  
  canHandle(context: ZodGenerationContext): boolean {
    return isMySchemaType(context.schema);
  }
  
  build(context: ZodGenerationContext): GeneratorFn<any> {
    return Gen.constant('my-value').generator;
  }
}

const registry = createCustomRegistry()
  .register(new MyStrategy());
```

##### `enableGracefulFallback(enabled?: boolean): CustomRegistry`

Enable or disable graceful degradation mode.

**Parameters:**
- `enabled` - Whether to enable graceful fallback (default: `true`)

**Returns:** The registry for chaining

**Example:**
```typescript
const registry = createCustomRegistry()
  .enableGracefulFallback(); // Enable
  
const strictRegistry = createCustomRegistry()
  .enableGracefulFallback(false); // Disable
```

##### `fromSchema<T>(schema: ZodSchema<T>): Gen<T>`

Generate a generator from a schema using this registry.

**Parameters:**
- `schema` - Zod schema to generate from

**Returns:** Generator for the schema type

**Example:**
```typescript
const registry = createCustomRegistry();
const gen = registry.fromSchema(z.string());
```

## Strategy System

### `ZodGenerationStrategy` Interface

Interface for implementing custom generation strategies.

```typescript
interface ZodGenerationStrategy {
  readonly name: string;
  readonly priority: number;
  canHandle(context: ZodGenerationContext): boolean;
  build(context: ZodGenerationContext): GeneratorFn<any>;
}
```

#### Properties

##### `name: string`

Human-readable name for the strategy (used in error messages).

##### `priority: number`

Priority for strategy selection. Higher numbers are checked first.

**Built-in priorities:**
- `PatternStrategy`: 100
- `ConstraintStrategy`: 50  
- `FilterStrategy`: 1

#### Methods

##### `canHandle(context: ZodGenerationContext): boolean`

Determine if this strategy can handle the given schema.

**Parameters:**
- `context` - Generation context with schema and path information

**Returns:** `true` if this strategy can handle the schema

##### `build(context: ZodGenerationContext): GeneratorFn<any>`

Build a generator function for the schema.

**Parameters:**
- `context` - Generation context with schema and recursion support

**Returns:** Generator function for the schema

### `ZodGenerationContext`

Context object passed to strategies.

```typescript
interface ZodGenerationContext {
  schema: ZodSchema<any>;
  path: string;
  recurse: (schema: ZodSchema<any>, path: string) => GeneratorFn<any>;
}
```

#### Properties

##### `schema: ZodSchema<any>`

The Zod schema to generate for.

##### `path: string`

Path to this schema in the overall structure (for error reporting).

Examples: `""`, `"user"`, `"user.profile.email"`

##### `recurse: Function`

Function to recursively generate nested schemas.

**Usage:**
```typescript
// In a strategy's build method
const valueGen = context.recurse(def.valueType, `${context.path}[value]`);
```

## Error Types

### `ZodGenerationError`

Error thrown when schema generation fails.

```typescript
class ZodGenerationError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly schema: ZodSchema<any>
  );
}
```

#### Properties

##### `path: string`

Path where the error occurred in the schema structure.

##### `schema: ZodSchema<any>`

The schema that caused the error.

#### Example

```typescript
try {
  Gen.fromSchema(unsupportedSchema);
} catch (error) {
  if (error instanceof ZodGenerationError) {
    console.log(`Error at ${error.path}: ${error.message}`);
    console.log('Problematic schema:', error.schema);
  }
}
```

## Utility Functions

### `getStrategyInfo(schema: ZodSchema<any>): StrategyInfo`

Get diagnostic information about strategy selection for a schema.

**Parameters:**
- `schema` - Schema to analyze

**Returns:** Strategy information object

```typescript
interface StrategyInfo {
  strategyName: string;
  canHandle: boolean[];
  path: string;
}
```

**Example:**
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

## Built-in Strategies

### PatternStrategy

Handles common string patterns with high-quality generators.

**Priority:** 100 (highest)

**Supported patterns:**
- `email` → realistic email addresses
- `url` → valid URLs
- `uuid` → properly formatted UUIDs
- `datetime` → ISO 8601 datetime strings
- `ip`, `ipv4`, `ipv6` → IP addresses
- `cidr` → CIDR notation
- `emoji` → Unicode emoji characters
- `nanoid`, `cuid`, `cuid2`, `ulid` → ID formats
- `base64`, `base64url` → Base64 encoded strings
- `jwt` → JSON Web Tokens
- `time` → Time strings (HH:MM:SS)
- `date` → Date strings (YYYY-MM-DD)
- `duration` → ISO 8601 duration strings
- `regex` → Basic regex pattern matching
- `includes`, `startsWith`, `endsWith` → String constraints

### ConstraintStrategy

Handles basic types with validation constraints.

**Priority:** 50 (medium)

**Supported types:**
- All primitive types (`string`, `number`, `boolean`, etc.)
- Collections (`array`, `object`, `tuple`, `record`, `map`, `set`)
- Unions (`union`, `discriminatedUnion`)
- Advanced types (`intersection`, `function`, `lazy`)
- Modifiers (`optional`, `nullable`, `default`, etc.)

### FilterStrategy

Generate-and-filter fallback for complex schemas.

**Priority:** 1 (lowest)

**When used:**
- Complex refinements
- Transforms and preprocessing
- Schemas other strategies can't handle

## Type Support Matrix

| Zod Type | Strategy | Support Level | Notes |
|----------|----------|---------------|-------|
| `ZodString` | Pattern/Constraint | ✅ Full | Pattern detection for common formats |
| `ZodNumber` | Constraint | ✅ Full | Respects min/max/int constraints |
| `ZodBoolean` | Constraint | ✅ Full | Simple true/false generation |
| `ZodDate` | Constraint | ✅ Full | Respects min/max date constraints |
| `ZodBigInt` | Constraint | ✅ Full | Supports constraints |
| `ZodArray` | Constraint | ✅ Full | Respects length constraints |
| `ZodObject` | Constraint | ✅ Full | Recursive object generation |
| `ZodTuple` | Constraint | ✅ Full | Fixed-length arrays with types |
| `ZodRecord` | Constraint | ✅ Full | Supports enum/union keys |
| `ZodMap` | Constraint | ✅ Full | Key-value pair generation |
| `ZodSet` | Constraint | ✅ Full | Unique value sets |
| `ZodUnion` | Constraint | ✅ Full | Random selection from options |
| `ZodDiscriminatedUnion` | Constraint | ✅ Full | Proper discriminator handling |
| `ZodIntersection` | Constraint | ✅ Full | Deep object merging |
| `ZodEnum` | Constraint | ✅ Full | Random enum value selection |
| `ZodNativeEnum` | Constraint | ✅ Full | Supports string and numeric enums |
| `ZodLiteral` | Constraint | ✅ Full | Returns exact literal value |
| `ZodFunction` | Constraint | ✅ Full | Mock function generation |
| `ZodLazy` | Constraint | ✅ Full | Recursive schema evaluation |
| `ZodPromise` | Constraint | ✅ Full | Wrapped promise generation |
| `ZodOptional` | Constraint | ✅ Full | Sometimes undefined |
| `ZodNullable` | Constraint | ✅ Full | Sometimes null |
| `ZodDefault` | Constraint | ✅ Full | Uses default when appropriate |
| `ZodCatch` | Constraint | ✅ Full | Fallback value handling |
| `ZodBranded` | Constraint | ✅ Full | Transparent brand handling |
| `ZodPipeline` | Filter | ⚠️ Partial | Basic pipeline support |
| `ZodEffects` (refine) | Filter | ⚠️ Partial | Generate-and-filter approach |
| `ZodEffects` (transform) | Filter | ⚠️ Partial | Pre-transform generation |
| `ZodPreprocess` | Filter | ⚠️ Partial | Post-process handling |
| `ZodNever` | None | ❌ None | Cannot generate impossible values |

## Examples

### Basic Usage

```typescript
import { z } from 'zod';
import { Gen } from 'hedgehog';

// Simple types
const stringGen = Gen.fromSchema(z.string());
const numberGen = Gen.fromSchema(z.number().int().min(0).max(100));
const boolGen = Gen.fromSchema(z.boolean());

// Complex types
const userGen = Gen.fromSchema(z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().min(18).optional(),
}));

// Collections
const listGen = Gen.fromSchema(z.array(z.string()).min(1).max(10));
const mapGen = Gen.fromSchema(z.record(z.enum(['a', 'b', 'c']), z.number()));
```

### Custom Registry Usage

```typescript
import { createCustomRegistry } from 'hedgehog/zod';

// Create registry with overrides
const registry = createCustomRegistry()
  .override(z.string().email(), Gen.constant('admin@company.com').generator)
  .enableGracefulFallback();

// Use custom registry
const gen = registry.fromSchema(userSchema);
```

### Strategy Implementation

```typescript
import { ZodGenerationStrategy, ZodGenerationContext } from 'hedgehog/zod';

class TimestampStrategy implements ZodGenerationStrategy {
  readonly name = 'TimestampStrategy';
  readonly priority = 75;

  canHandle(context: ZodGenerationContext): boolean {
    const schema = context.schema as any;
    return schema._def?.typeName === 'ZodNumber' && 
           schema._def?.description === 'timestamp';
  }

  build(context: ZodGenerationContext): GeneratorFn<number> {
    return Gen.choose(
      Date.now() - 86400000, // Yesterday
      Date.now() + 86400000  // Tomorrow
    ).generator;
  }
}

const registry = createCustomRegistry()
  .register(new TimestampStrategy());
```

### Error Handling

```typescript
import { ZodGenerationError, getStrategyInfo } from 'hedgehog/zod';

try {
  const gen = Gen.fromSchema(complexSchema);
} catch (error) {
  if (error instanceof ZodGenerationError) {
    console.error(`Generation failed at path: ${error.path}`);
    console.error(`Error: ${error.message}`);
    
    // Get strategy info for debugging
    const info = getStrategyInfo(error.schema);
    console.log(`Available strategies tried: ${info.canHandle}`);
    console.log(`Selected strategy: ${info.strategyName}`);
  }
}
```

## Performance Notes

- **PatternStrategy**: Fastest, generates high-quality realistic data
- **ConstraintStrategy**: Fast, generates valid constrained data  
- **FilterStrategy**: Slowest, may timeout on restrictive constraints

Use overrides to replace slow schemas during testing:

```typescript
const fastRegistry = createCustomRegistry()
  .override(slowRefinementSchema, Gen.constant(validExample).generator);
```