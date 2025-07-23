# Zod Integration - Developer Guide

Internal architecture and development guide for contributors to the Zod integration system.

## Architecture Overview

The Zod integration uses a **layered strategy pattern** to handle the complexity of generating values for diverse schema types while maintaining performance and extensibility.

### Design Principles

1. **Separation of Concerns** - Each strategy handles a specific class of schemas
2. **Extensibility** - New strategies can be added without modifying existing code
3. **Performance Hierarchy** - Faster strategies are tried first
4. **Graceful Degradation** - System continues working even with unsupported schemas
5. **Type Safety** - Full TypeScript support with proper type inference

### File Structure

```
src/gen/zod/
├── core/                           # Core infrastructure
│   ├── strategy.ts                 # Strategy pattern implementation
│   ├── zod.ts                     # Main entry point & registry
│   └── errors.ts                  # Error types and handling
├── strategies/                     # Generation strategies
│   ├── pattern-strategy.ts        # Smart pattern recognition
│   ├── constraint-strategy.ts     # Type + constraint handling  
│   ├── filter-strategy.ts         # Generate-and-filter fallback
│   └── constructive-string.ts     # String construction helpers
├── patterns/                      # Pattern-specific generators
│   └── string-patterns.ts         # Email, UUID, URL, etc.
└── tests/                         # Strategy and integration tests
    ├── override.test.ts
    ├── record.test.ts
    └── new-types.test.ts
```

## Strategy Pattern Implementation

### Core Interfaces

```typescript
interface ZodGenerationStrategy {
  readonly name: string;           // For debugging/error messages
  readonly priority: number;       // Selection order (higher = first)
  canHandle(context: ZodGenerationContext): boolean;
  build(context: ZodGenerationContext): GeneratorFn<any>;
}

interface ZodGenerationContext {
  schema: ZodSchema<any>;          // Schema to generate for
  path: string;                    // Path for error reporting  
  recurse: (schema, path) => GeneratorFn; // Handle nested schemas
}
```

### Registry Architecture

The `ZodGenerationRegistry` manages strategy selection:

```typescript
class ZodGenerationRegistry {
  private strategies: ZodGenerationStrategy[] = [];
  private overrides = new Map<ZodSchema<any>, GeneratorFn<any>>();
  
  build<T>(schema: ZodSchema<T>, path = ''): GeneratorFn<T> {
    // 1. Check for explicit overrides (highest priority)
    if (this.overrides.has(schema)) {
      return this.overrides.get(schema);
    }
    
    // 2. Try strategies in priority order
    for (const strategy of this.strategies) {
      if (strategy.canHandle(context)) {
        return strategy.build(context);
      }
    }
    
    // 3. Graceful degradation or error
    if (this.enableGracefulDegradation) {
      return this.createGracefulFallback(schema, path);
    }
    throw new ZodGenerationError(...);
  }
}
```

## Strategy Implementations

### 1. PatternStrategy (Priority: 100)

**Purpose**: High-quality generation for common string patterns

**Decision Logic**:
```typescript
canHandle(context: ZodGenerationContext): boolean {
  const def = context.schema._def;
  
  // Only handle ZodString with single pattern check
  if (def.typeName !== 'ZodString') return false;
  if (!def.checks?.length) return false;
  
  const supportedPatterns = ['email', 'url', 'uuid', 'datetime', ...];
  const matchingChecks = def.checks.filter(check => 
    supportedPatterns.includes(check.kind)
  );
  
  // Only handle single patterns (avoid conflicts with ConstraintStrategy)
  return matchingChecks.length === 1;
}
```

**Why this approach?**
- **Single responsibility**: Only handles well-known patterns
- **High quality**: Generates realistic, meaningful data
- **Performance**: Direct mapping from pattern to generator
- **Conflict avoidance**: Defers combined constraints to ConstraintStrategy

### 2. ConstraintStrategy (Priority: 50)

**Purpose**: Basic type generation with validation constraints

**Key Features**:
- Handles all basic Zod types (`ZodString`, `ZodNumber`, etc.)
- Applies constraints constructively (generates valid values directly)
- Supports complex nested types (objects, arrays, unions)
- Implements new Zod features (intersections, discriminated unions, etc.)

**Architecture Decisions**:

#### Type Dispatch Pattern
```typescript
build(context: ZodGenerationContext): GeneratorFn<any> {
  const def = context.schema._def;
  
  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodString:
      return this.buildStringGenerator(def);
    case z.ZodFirstPartyTypeKind.ZodNumber:
      return this.buildNumberGenerator(def);
    // ... etc
    default:
      throw new Error(`Unsupported type: ${def.typeName}`);
  }
}
```

#### Constructive Generation Philosophy
Instead of generate-and-filter, build values that satisfy constraints:

```typescript
// ❌ Generate-and-filter (slow)
Gen.string().filter(s => s.length >= 5 && s.length <= 10)

// ✅ Constructive (fast) 
Gen.string().withLength(Gen.choose(5, 10))
```

#### Complex Type Handling

**Objects**: Recursive generation with proper typing
```typescript
private buildObjectGenerator(def, recurse, path) {
  const shape = def.shape();
  const generators = {};
  
  for (const [key, valueSchema] of Object.entries(shape)) {
    generators[key] = new Gen(recurse(valueSchema, `${path}.${key}`));
  }
  
  return Gen.object(generators).generator;
}
```

**Intersections**: Deep merging with conflict resolution
```typescript
private buildIntersectionGenerator(def, recurse, path) {
  const leftGen = recurse(def.left, `${path}[left]`);
  const rightGen = recurse(def.right, `${path}[right]`);
  
  return (size, seed) => {
    const leftTree = new Gen(leftGen).generate(size, seed);
    const rightTree = new Gen(rightGen).generate(size.split());
    
    // Deep merge with proper conflict resolution
    const merged = this.deepMerge(leftTree.value, rightTree.value);
    return Tree.singleton(merged);
  };
}
```

### 3. FilterStrategy (Priority: 1)

**Purpose**: Generate-and-filter fallback for complex schemas

**When used**:
- Complex refinements that can't be generated constructively
- Transforms and preprocessing steps
- Unsupported schema types that other strategies can't handle

**Performance Considerations**:
- Limited to 100 attempts before failing
- Tracks success rate for debugging
- Can be slow for restrictive constraints

## String Pattern System

### Pattern Generator Architecture

String patterns are implemented as pure functions that return `GeneratorFn<string>`:

```typescript
export function email(): GeneratorFn<string> {
  return create((size: Size, seed: Seed) => {
    // Generate realistic email structure
    const domains = ['example.com', 'test.org', ...];
    const prefixes = ['user', 'admin', 'demo', ...];
    
    // Use seed for deterministic generation
    const [userIndex, seed1] = seed.nextBounded(prefixes.length);
    const [userSuffix, seed2] = seed1.nextBounded(1000);
    const [domainIndex] = seed2.nextBounded(domains.length);
    
    const email = `${prefixes[userIndex]}${userSuffix}@${domains[domainIndex]}`;
    
    // Include shrinking for property-based testing
    return shrinkBuilder<string>()
      .add('user@example.com')
      .build(email);
  });
}
```

### Pattern Detection Logic

PatternStrategy uses Zod's internal check structure:

```typescript
// Zod schema: z.string().email()
// Internal structure:
{
  typeName: 'ZodString',
  checks: [{ kind: 'email' }]
}

// Pattern detection:
const emailCheck = def.checks.find(check => check.kind === 'email');
if (emailCheck) return email();
```

### Unicode Range Generation

For emojis and special characters, we use algorithmic generation:

```typescript
export function emoji(): GeneratorFn<string> {
  return create((size: Size, seed: Seed) => {
    const emojiRanges = [
      { start: 0x1F600, length: 80 }, // Emoticons & People
      { start: 0x1F300, length: 96 }, // Misc Symbols  
      { start: 0x1F680, length: 80 }, // Transport & Map
      { start: 0x2600, length: 56 },  // Misc Symbols
    ];
    
    const [rangeIndex, seed1] = seed.nextBounded(emojiRanges.length);
    const [offset] = seed1.nextBounded(emojiRanges[rangeIndex].length);
    
    return Tree.singleton(String.fromCodePoint(
      emojiRanges[rangeIndex].start + offset
    ));
  });
}
```

**Benefits**:
- Smaller code size (10 lines vs 140+ hardcoded emojis)
- Better coverage (312 emojis vs 30 hardcoded)
- Systematic approach (covers all emoji categories)

## Error Handling System

### Path-Based Error Reporting

Errors include full path context for complex nested schemas:

```typescript
// Schema: z.object({ user: z.object({ profile: z.unsupported() }) })
// Error: "No strategy available for ZodUnsupported at path 'user.profile'"

private buildRecursive(schema, path) {
  try {
    return this.build(schema, path);
  } catch (error) {
    if (error instanceof ZodGenerationError) {
      // Path is already set
      throw error;
    }
    // Wrap other errors with path information
    throw new ZodGenerationError(error.message, path, schema);
  }
}
```

### Graceful Degradation Implementation

```typescript
private createGracefulFallback(schema, path): GeneratorFn<any> {
  const typeName = schema._def?.typeName;
  
  // Import Gen at runtime to avoid circular dependencies
  const Gen = require('../../gen.js').Gen;
  
  switch (typeName) {
    case 'ZodString':
      return Gen.constant(`fallback-string-${path.replace(/[^a-zA-Z0-9]/g, '-')}`).generator;
    case 'ZodNumber':
      return Gen.constant(0).generator;
    // ... etc for each type
  }
}
```

**Design decisions**:
- Path-based fallback strings help identify where fallbacks are used
- Type-appropriate defaults (strings get strings, numbers get 0, etc.)
- Runtime import avoids circular dependency issues

## Override System Implementation

### Schema Identity-Based Overrides

Overrides are stored using schema object identity:

```typescript
private overrides = new Map<ZodSchema<any>, GeneratorFn<any>>();

override<T>(schema: ZodSchema<T>, generator: GeneratorFn<T>): this {
  this.overrides.set(schema, generator);
  return this;
}
```

**Why object identity?**
- Allows precise control over which schemas are overridden
- Prevents accidental override of similar but different schemas
- Enables schema-specific customization in complex types

### Chaining API Implementation

The registry returns a chainable API object:

```typescript
export function createCustomRegistry() {
  const registry = new ZodGenerationRegistry();
  
  const api = {
    register: (strategy) => {
      registry.register(strategy);
      return api; // Return api for chaining
    },
    
    override: (schema, generator) => {
      registry.override(schema, generator);
      return api; // Return api for chaining
    },
    
    fromSchema: (schema) => {
      return new Gen(registry.build(schema));
    }
  };
  
  return api;
}
```

## Performance Optimizations

### Strategy Priority System

Higher priority strategies are checked first to minimize overhead:

```typescript
register(strategy: ZodGenerationStrategy): this {
  this.strategies.push(strategy);
  // Sort by priority (higher first)
  this.strategies.sort((a, b) => b.priority - a.priority);
  return this;
}
```

### Early Exit Pattern

Strategies use early returns to minimize computation:

```typescript
canHandle(context: ZodGenerationContext): boolean {
  const def = context.schema._def;
  
  // Fast path: check type first
  if (def.typeName !== 'ZodString') return false;
  
  // Then check for supported patterns
  if (!def.checks?.length) return false;
  
  // Only do expensive work if we might handle it
  return this.hasMatchingPattern(def.checks);
}
```

### Constructive vs Filter Performance

| Approach | Speed | Use Case | Example |
|----------|-------|----------|---------|
| Constructive | ⚡ Fast | Simple constraints | `z.number().min(0).max(100)` |
| Pattern | ⚡ Fast | Known formats | `z.string().email()` |
| Filter | 🐌 Slow | Complex refinements | `z.string().refine(isPrime)` |

## Testing Strategy

### Strategy Testing Pattern

Each strategy has comprehensive tests covering:

1. **Can Handle Logic**: Test decision boundaries
2. **Generation Quality**: Validate output meets schema requirements  
3. **Edge Cases**: Empty arrays, boundary values, etc.
4. **Error Handling**: Proper error messages and paths

```typescript
describe('PatternStrategy', () => {
  it('handles single pattern checks', () => {
    const strategy = new PatternStrategy();
    const emailSchema = z.string().email();
    
    expect(strategy.canHandle({ schema: emailSchema, path: '', recurse: jest.fn() })).toBe(true);
  });
  
  it('rejects combined constraints', () => {
    const strategy = new PatternStrategy();
    const complexSchema = z.string().email().min(10); // Multiple constraints
    
    expect(strategy.canHandle({ schema: complexSchema, path: '', recurse: jest.fn() })).toBe(false);
  });
});
```

### Integration Testing

Test the full system with realistic schemas:

```typescript
describe('Zod Integration', () => {
  it('generates valid complex user objects', () => {
    const userSchema = z.object({
      id: z.string().uuid(),
      profile: z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
      settings: z.record(z.enum(['a', 'b']), z.boolean()),
    });
    
    const gen = Gen.fromSchema(userSchema);
    const user = gen.sample();
    
    expect(userSchema.safeParse(user).success).toBe(true);
  });
});
```

## Adding New Features

### Adding a New String Pattern

1. **Add pattern generator** in `string-patterns.ts`:
```typescript
export function myPattern(): GeneratorFn<string> {
  return create((size: Size, seed: Seed) => {
    // Implementation
    return Tree.singleton(generatedValue);
  });
}
```

2. **Update PatternStrategy** to recognize it:
```typescript
// In getSupportedPatterns()
'myPattern',

// In extractPatterns()  
case 'myPattern':
  patterns.isMyPattern = true;
  break;

// In build()
if (patterns.isMyPattern) return myPattern();
```

3. **Add tests** for the new pattern

### Adding a New Zod Type

1. **Add to ConstraintStrategy**:
```typescript
// In canHandle()
z.ZodFirstPartyTypeKind.ZodMyNewType,

// In build()
case z.ZodFirstPartyTypeKind.ZodMyNewType:
  return this.buildMyNewTypeGenerator(def, recurse, path);
```

2. **Implement the generator**:
```typescript
private buildMyNewTypeGenerator(def, recurse, path): GeneratorFn<MyType> {
  // Extract type-specific information from def
  // Use recurse() for nested schemas
  // Return appropriate generator
}
```

3. **Add comprehensive tests**

### Adding a New Strategy

1. **Implement the strategy interface**:
```typescript
export class MyStrategy implements ZodGenerationStrategy {
  readonly name = 'MyStrategy';
  readonly priority = 75; // Between Pattern and Constraint
  
  canHandle(context: ZodGenerationContext): boolean {
    // Decision logic
  }
  
  build(context: ZodGenerationContext): GeneratorFn<any> {
    // Generation logic
  }
}
```

2. **Register in default registry** (if appropriate):
```typescript
// In zod.ts
defaultRegistry
  .register(new PatternStrategy())
  .register(new MyStrategy())      // Add here
  .register(new ConstraintStrategy())
  .register(new FilterStrategy());
```

3. **Add strategy-specific tests**

## Debugging and Diagnostics

### Strategy Selection Debugging

Use `getStrategyInfo()` to understand strategy selection:

```typescript
export function getStrategyInfo(schema: ZodSchema<any>) {
  const strategies = defaultRegistry.getStrategies();
  const context = { schema, path: '', recurse: () => {} };
  
  return {
    strategyName: strategies.find(s => s.canHandle(context))?.name || 'None',
    canHandle: strategies.map(s => s.canHandle(context)),
    path: '',
  };
}
```

### Performance Profiling

Add timing to strategy selection:

```typescript
build<T>(schema: ZodSchema<T>, path = ''): GeneratorFn<T> {
  const start = performance.now();
  
  for (const strategy of this.strategies) {
    const strategyStart = performance.now();
    if (strategy.canHandle(context)) {
      const result = strategy.build(context);
      console.log(`${strategy.name} took ${performance.now() - strategyStart}ms`);
      return result;
    }
  }
  
  console.log(`Total strategy selection: ${performance.now() - start}ms`);
  throw new ZodGenerationError(...);
}
```

## Future Architecture Considerations

### Planned Improvements

1. **Module Organization**: Split large files into focused modules
2. **Plugin System**: Allow external strategy packages
3. **Caching**: Cache generated values for identical schemas
4. **Async Support**: Handle async validation and generation
5. **Schema Analysis**: Pre-analyze schemas for optimization hints

### Compatibility Strategy

- **Backward Compatibility**: All public APIs remain stable
- **Internal Flexibility**: Internal architecture can evolve
- **Extension Points**: Strategy system allows adding features without breaking changes
- **Deprecation Path**: Old patterns are supported while new ones are added

## Contributing Guidelines

### Code Style

- Follow existing TypeScript conventions
- Use descriptive variable names (`emailSchema` not `s`)
- Include JSDoc comments for public APIs
- Prefer composition over inheritance

### Testing Requirements

- Unit tests for all strategies
- Integration tests for new Zod types
- Performance benchmarks for new features
- Error handling test coverage

### Documentation Updates

- Update API reference for new features
- Add examples to user documentation
- Update this developer guide for architectural changes
- Include migration guides for breaking changes

### Review Process

1. **Strategy Review**: Is this the right strategy for the use case?
2. **Performance Review**: Does this maintain or improve performance?
3. **Compatibility Review**: Does this break existing APIs?
4. **Test Coverage**: Are all code paths tested?
5. **Documentation**: Are docs updated appropriately?