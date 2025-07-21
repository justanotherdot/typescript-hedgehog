# Zod schema integration plan

## Objective

Implement comprehensive Zod schema integration that allows automatic generator creation from Zod schemas, making property-based testing seamless for TypeScript applications.

## Current state analysis

### Existing generators
- **Primitives**: `bool()`, `int(range)`, `string()`, `stringOfLength(n)`
- **Combinators**: `constant()`, `map()`, `filter()`, `bind()`, `oneOf()`
- **Collections**: Basic array support via Gen methods
- **Custom**: `Gen.create()` for manual generator construction

### Missing core generators
1. `array(elementGen, lengthRange?)` - arrays with configurable length
2. `object({key: gen, ...})` - object generation with typed keys
3. `tuple(gen1, gen2, ...)` - fixed-length heterogeneous tuples
4. `union(genA, genB, ...)` - discriminated and simple unions
5. `optional(gen)` - values that may be undefined
6. `nullable(gen)` - values that may be null
7. `number(min?, max?)` - floating point numbers with bounds
8. `date(min?, max?)` - date generation within ranges
9. `enum(values)` - enumeration from value arrays
10. `literal(value)` - specific literal values

## Implementation phases

### Phase 1: Core collection generators
**Priority**: High  
**Estimated effort**: 2-3 days

Implement fundamental collection generators that Zod schemas depend on:

```typescript
// Array generation with shrinking
Gen.array<T>(elementGen: Gen<T>, options?: {
  minLength?: number;
  maxLength?: number;
  length?: number;
}): Gen<T[]>

// Object generation with typed properties
Gen.object<T extends Record<string, any>>(
  schema: { [K in keyof T]: Gen<T[K]> }
): Gen<T>

// Fixed-length tuple generation
Gen.tuple<T extends readonly unknown[]>(
  ...generators: { [K in keyof T]: Gen<T[K]> }
): Gen<T>
```

**Success criteria**:
- Arrays shrink by reducing length and shrinking elements
- Objects shrink by shrinking individual properties
- Tuples shrink by shrinking individual elements
- All generators work with existing test framework

### Phase 2: Union and optional types
**Priority**: High  
**Estimated effort**: 1-2 days

Implement generators for optional and union types:

```typescript
// Optional value generation (undefined | T)
Gen.optional<T>(gen: Gen<T>): Gen<T | undefined>

// Nullable value generation (null | T)  
Gen.nullable<T>(gen: Gen<T>): Gen<T | null>

// Union type generation
Gen.union<T extends readonly unknown[]>(
  ...generators: { [K in keyof T]: Gen<T[K]> }
): Gen<T[number]>

// Discriminated union support
Gen.discriminatedUnion<T>(
  discriminator: string,
  unions: Record<string, Gen<T>>
): Gen<T>
```

**Success criteria**:
- Optional values generate both undefined and actual values
- Union generators choose between alternatives with equal probability
- Discriminated unions properly type the discriminator field
- Shrinking works correctly for all union types

### Phase 3: Extended primitives
**Priority**: Medium  
**Estimated effort**: 1-2 days

Extend primitive generators to match Zod's type coverage:

```typescript
// Enhanced number generation
Gen.number(options?: {
  min?: number;
  max?: number;
  multipleOf?: number;
  finite?: boolean;
  safe?: boolean;
}): Gen<number>

// Date generation
Gen.date(options?: {
  min?: Date;
  max?: Date;
}): Gen<Date>

// Enum generation from arrays
Gen.enum<T extends readonly [string, ...string[]]>(
  values: T
): Gen<T[number]>

// Literal value generation
Gen.literal<T extends string | number | boolean>(
  value: T
): Gen<T>

// Enhanced string generation
Gen.string(options?: {
  minLength?: number;
  maxLength?: number;
  regex?: RegExp;
  email?: boolean;
  url?: boolean;
  uuid?: boolean;
}): Gen<string>
```

**Success criteria**:
- Number generators respect all constraints
- Date generators work within specified ranges
- String generators support common validation patterns
- All generators integrate with existing shrinking

### Phase 4: Zod schema introspection
**Priority**: High  
**Estimated effort**: 3-4 days

Implement core Zod schema parsing and generator creation:

```typescript
// Main schema-to-generator conversion
Gen.fromSchema<T>(schema: z.ZodSchema<T>): Gen<T>

// Support for all basic Zod types
interface ZodGeneratorMap {
  ZodString: Gen<string>;
  ZodNumber: Gen<number>;
  ZodBoolean: Gen<boolean>;
  ZodDate: Gen<Date>;
  ZodArray: Gen<unknown[]>;
  ZodObject: Gen<Record<string, unknown>>;
  ZodUnion: Gen<unknown>;
  ZodOptional: Gen<unknown>;
  ZodNullable: Gen<unknown>;
  ZodEnum: Gen<string>;
  ZodLiteral: Gen<unknown>;
  ZodTuple: Gen<unknown[]>;
}
```

**Implementation approach**:
1. Use Zod's internal `_def` property to inspect schema structure
2. Recursively build generators for nested schemas
3. Respect all Zod constraints (min/max, length, regex, etc.)
4. Handle refinements by filtering generated values

**Success criteria**:
- All basic Zod types generate appropriate values
- Nested schemas work correctly (objects containing arrays, etc.)
- Generated values always pass schema validation
- Performance is acceptable for complex schemas

### Phase 5: Advanced Zod features
**Priority**: Medium  
**Estimated effort**: 2-3 days

Support advanced Zod functionality:

```typescript
// Refinement support via filtering
schema.refine(predicate) // -> Gen with filter(predicate)

// Transform support
schema.transform(fn) // -> Gen with map(fn)

// Default value integration
schema.default(value) // -> Use default in generation strategy

// Preprocessing support
schema.preprocess(fn, schema) // -> Gen with preprocessing

// Brand type support
schema.brand<Brand>() // -> Maintain type safety

// Catch support for error handling
schema.catch(fallback) // -> Generator with fallback on invalid values
```

**Success criteria**:
- Refinements properly filter generated values
- Transforms apply correctly to generated data
- Default values are used appropriately
- Complex nested refinements work

### Phase 6: Performance optimization
**Priority**: Low  
**Estimated effort**: 1-2 days

Optimize generator performance for complex schemas:

1. **Caching**: Cache parsed schema generators
2. **Lazy evaluation**: Only parse schema branches when needed
3. **Bulk generation**: Use AdaptiveSeed batching for array/object generation
4. **Shrinking optimization**: Optimize shrinking for complex structures

**Success criteria**:
- Large schemas parse quickly
- Generator creation overhead is minimal
- Bulk operations use WASM batching when beneficial
- Memory usage is reasonable for complex generators

## API design

### Primary API
```typescript
import { Gen } from 'hedgehog';
import { z } from 'zod';

// Schema definition
const userSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(0).max(120).optional(),
  tags: z.array(z.string()).max(10),
  metadata: z.record(z.unknown()).optional()
});

// Automatic generator creation
const userGen = Gen.fromSchema(userSchema);
type User = z.infer<typeof userSchema>;

// Use in property-based tests
const property = forAll(userGen, (user: User) => {
  // Test properties about user objects
  return userSchema.safeParse(user).success;
});
```

### Manual composition API
```typescript
// Manual generator composition for complex cases
const customUserGen = Gen.object({
  id: Gen.number({ min: 1, max: 1000000 }),
  name: Gen.string({ minLength: 1, maxLength: 100 }),
  email: Gen.string({ email: true }),
  age: Gen.optional(Gen.number({ min: 0, max: 120 })),
  tags: Gen.array(Gen.string(), { maxLength: 10 }),
  metadata: Gen.optional(Gen.record(Gen.unknown()))
});
```

## Dependencies

### Required additions
- **Zod**: Add as peer dependency for schema introspection
- **Type utilities**: Additional TypeScript utility types for schema inference

### Optional enhancements
- **Faker.js integration**: For realistic data generation
- **JSON Schema support**: Alternative to Zod schemas
- **Ajv integration**: Additional validation library support

## Testing strategy

### Unit tests
- Each generator type has comprehensive tests
- Shrinking behavior is verified for all generators
- Edge cases are covered (empty arrays, optional undefined, etc.)

### Integration tests
- Complex nested schemas generate valid data
- Generated data always passes original schema validation
- Performance benchmarks for large schemas

### Compatibility tests
- Works with all supported Zod versions
- TypeScript inference is correct
- Generates data matching Zod's runtime behavior

## Migration strategy

### Backward compatibility
- Existing generator API remains unchanged
- New generators are additive to existing functionality
- No breaking changes to current users

### Documentation updates
- Update README with Zod integration examples
- Add comprehensive Zod integration guide
- Update API documentation for new generators

## Future enhancements

### Beyond this plan
1. **Other schema libraries**: Yup, Joi, io-ts integration
2. **Custom constraint DSL**: Domain-specific constraint language
3. **Database integration**: Generate data matching database schemas
4. **GraphQL schema support**: Generate data from GraphQL schemas
5. **OpenAPI integration**: Generate test data from API specifications

## Success metrics

### Quantitative goals
- Support 95% of common Zod schema patterns
- Generated data passes schema validation 100% of time
- Performance within 2x of manual generator creation
- Zero breaking changes to existing API

### Qualitative goals
- API feels natural to TypeScript/Zod users
- Documentation is comprehensive and clear
- Integration examples are realistic and helpful
- Library becomes go-to choice for TypeScript property-based testing