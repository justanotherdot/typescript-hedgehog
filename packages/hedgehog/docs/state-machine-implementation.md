# State Machine Testing: Implementation Guide

Internal architecture and design decisions for maintainers.

## Core Architecture

### Two-Phase Execution

State machine testing uses a two-phase architecture:

**Phase 1: Generation (Symbolic)**
- Generate action sequences without executing
- Create Symbolic variables as placeholders for unknown results
- Build dependency chains using symbolic references
- State contains Symbolic variables

**Phase 2: Execution (Concrete)**
- Execute actions against real system
- Wrap results in Concrete wrappers
- Store Symbolic ID → Concrete mappings in Environment
- Resolve symbolic references to concrete values

This separation enables:
- Pure generation (no side effects, shrinkable)
- Deferred execution (run sequences multiple times)
- Variable resolution (reference future results)

### Variable System

**Symbolic Variables**
- Created during generation
- Unique ID for lookup
- Used in state and action inputs
- Compared by ID (`symbolic.id === other.id`)

**Concrete Wrappers**
- Created during execution
- Wrap actual executor results
- Stored in Environment by Symbolic ID
- Compared by reference (`concrete === other`)

**Why wrappers instead of raw values?**

TypeScript can't override `===` operator. Without wrappers:
```typescript
const id1 = "user-123";
const id2 = "user-123";
id1 === id2  // true - same value

map.set(id1, data1);
map.set(id2, data2);
map.size  // 1 - collision!
```

With Concrete wrappers:
```typescript
const c1 = new Concrete("user-123");
const c2 = new Concrete("user-123");
c1 === c2  // false - different objects

map.set(c1, data1);
map.set(c2, data2);
map.size  // 2 - no collision
```

### Environment

Maps Symbolic IDs to Concrete wrappers:

```typescript
class Environment {
  private bindings = Map<number, Concrete<unknown>>();

  bind(symbolic: Symbolic<T>, concrete: Concrete<T>) {
    this.bindings.set(symbolic.id, concrete);
  }

  lookup(symbolic: Symbolic<T>): Concrete<T> | undefined {
    return this.bindings.get(symbolic.id);
  }
}
```

**Interning Cache**

Environment also maintains a cache ensuring same value → same Concrete instance:

```typescript
createConcrete<T>(value: T): Concrete<T> {
  const cacheKey = typeof value === 'object' ? JSON.stringify(value) : value;

  if (this.concreteCache.has(cacheKey)) {
    return this.concreteCache.get(cacheKey)!;  // Reuse existing
  }

  const concrete = new Concrete(value);
  this.concreteCache.set(cacheKey, concrete);
  return concrete;
}
```

**Why interning?**

Enables value-based equality via reference equality. When executors return duplicate values, we get the same Concrete instance, so `Map<Variable, Data>` works correctly:

```typescript
// Action 1 executes → "duplicate-id"
const c1 = env.createConcrete("duplicate-id");  // Creates new

// Action 2 executes → "duplicate-id"
const c2 = env.createConcrete("duplicate-id");  // Returns c1!

c1 === c2  // true - same instance
```

This matches Haskell's `newtype Concrete a deriving (Eq)` which gives structural equality automatically.

### Resolution Functions

Two resolution functions with different purposes:

**`concretizeInput(input, env): Input`**
- Replaces Symbolic with Concrete wrappers
- Preserves Variable structure
- Used for update callbacks (need Variables for Map keys)

```typescript
// { userId: Var0 } → { userId: Concrete("user-123") }
```

**`resolveInput(input, env): ResolvedInput`**
- Fully unwraps to plain values
- Removes all Variable wrappers
- Used for executors and ensure callbacks

```typescript
// { userId: Var0 } → { userId: "user-123" }
// { userId: Concrete("user-123") } → { userId: "user-123" }
```

**Why two functions?**

- Update needs Variables as Map keys → use `concretizeInput`
- Executors don't know about Variables → use `resolveInput`
- Ensure compares plain values → use `resolveInput`

**`resolveState(state, env): State`**
- Recursively resolves Variables in state
- Handles Maps by resolving both keys and values
- Used before passing state to ensure callbacks

## Execution Flow

### Sequential Execution

```
For each action:
  1. Concretize input (Symbolic → Concrete for require)
  2. Check require(state, concretizedInput)
  3. Resolve input (unwrap for executor)
  4. Execute: result = executor(resolvedInput)
  5. Intern: concreteOutput = env.createConcrete(result)
  6. Bind: env.bind(action.output, concreteOutput)
  7. Update: state = update(state, action.input, action.output)
     → Receives Symbolic variables for Map keys
  8. Resolve state for ensure
  9. Check ensure(resolvedBefore, resolvedAfter, resolvedInput, result)
```

**Key invariant:** Update receives Symbolic variables, ensure receives unwrapped values.

### Parallel Execution

**Execution phase:**
1. Execute prefix sequentially
2. Execute branches concurrently (Promise.all)
3. Each branch gets cloned Environment with shared interning cache
4. Collect results and check linearization

**Linearization check:**
- Generate all interleavings of branch actions
- For each interleaving:
  - Create fresh Environment
  - Execute actions sequentially
  - Check preconditions and postconditions
  - If all pass, interleaving is valid
- If at least one valid interleaving exists, test passes

**Why clone Environment with shared cache?**

Each branch needs independent bindings (different Symbolic → Concrete mappings), but shared cache ensures duplicate values return same Concrete instance across branches.

## Invariants and Properties

### Model-SUT Parity

**Property:** If model and SUT use the same data structure, they should produce identical results after resolution.

```typescript
// Example: Both model and SUT are Map<string, number>
interface State {
  items: Map<Variable<string>, number>;  // Model with Variables
}

const realMap = new Map<string, number>();  // SUT

// If executors return duplicate IDs:
// Action 1: executor returns "duplicate-id"
// Action 2: executor returns "duplicate-id"

// Model after resolution: Map { "duplicate-id" → value2 }  (1 entry, overwrite)
// Real:                    Map { "duplicate-id" → value2 }  (1 entry, overwrite)

// Both should have size 1 ✓
```

Before interning, this failed because duplicate IDs created different Concrete instances, causing model to have 2 entries while SUT had 1.

### Variable Equality

**Symbolic equality:** By ID
```typescript
Var0.equals(Var1)  // false - different IDs
Var0.equals(Var0)  // true - same ID
```

**Concrete equality:** By value (with interning ensuring reference equality)
```typescript
env.createConcrete("x") === env.createConcrete("x")  // true - same instance
env.createConcrete("x") === env.createConcrete("y")  // false - different values
```

**Map key behavior:**
- During generation: Symbolic variables as keys, compared by ID
- During execution: Concrete wrappers as keys, compared by reference
- After resolution: Plain values as keys, compared by value

### Type Safety

`ResolvedInput<T>` transforms Variable types to their wrapped values:

```typescript
type Input = { id: Variable<string>; count: number };
type Resolved = ResolvedInput<Input>;
// Resolved = { id: string; count: number }
```

Ensures executors receive plain values, not Variables, with TypeScript enforcement.

## Testing the Tests

State machine testing code should verify:

1. **Variable resolution works correctly**
   - Symbolic → Concrete mapping via Environment
   - Interning ensures value equality
   - `variable-map-key-test.test.ts` verifies Map behavior

2. **Callbacks receive correct types**
   - require: State with Variables, Input with Variables
   - update: State with Variables, Input with Variables, Variable<Output>
   - ensure: Resolved state (plain values), resolved input, plain output

3. **Parallel linearization is sound**
   - All interleavings are checked
   - Valid interleaving → test passes
   - No valid interleaving → test fails

4. **Edge cases**
   - Empty sequences
   - Duplicate executor results
   - Nested Variables in complex structures
   - Map collision detection

## Common Pitfalls

1. **Forgetting to intern**: Always use `env.createConcrete()`, never `new Concrete()` directly in execution path

2. **Wrong resolution function**: Use `concretizeInput` for callbacks needing Variables, `resolveInput` for plain values

3. **Mixing Symbolic and Concrete**: Update must work with Symbolic variables during generation and execution

4. **Global state in cache**: Each Environment should have isolated bindings but can share interning cache for value equality

5. **Not resolving state before ensure**: State must be resolved (Variables → values) before comparison in ensure callbacks

## Future Improvements

- **Cache eviction**: Interning cache grows unbounded, consider LRU or weak references
- **Better collision detection**: Track when duplicate values are interned, warn on likely bugs
- **Optimization**: Skip linearization for independent actions (commutative operations)
- **Shrinking**: Support for shrinking parallel sequences (currently limited)
