# State machine testing implementation

This document explains the technical implementation of state machine testing in TypeScript Hedgehog, covering the core concepts, design decisions, and implementation details.

## Architecture overview

The state machine testing implementation follows a two-phase execution model inspired by Haskell Hedgehog:

1. **Generation phase**: Create command sequences using symbolic variables
2. **Execution phase**: Execute sequences with concrete values

This separation allows generating realistic command sequences without actually executing them, enabling better test case generation and shrinking.

## Core components

### Variable system (`src/state.ts:8-63`)

The foundation is a symbolic/concrete variable duality:

```typescript
export class Symbolic<_T> {
  readonly type = 'symbolic' as const;
  readonly id: number;
  readonly typeName: string;

  constructor(typeName: string) {
    this.id = nextSymbolicId++;
    this.typeName = typeName;
  }
}

export class Concrete<T> {
  readonly type = 'concrete' as const;
  constructor(readonly value: T) {}
}

export type Variable<T> = Symbolic<T> | Concrete<T>;
```

**Design decisions:**
- **Unique IDs**: Each symbolic variable gets a unique numeric ID for reliable identity
- **Type parameter**: The `<T>` parameter provides type safety while the variable is unresolved
- **Type discrimination**: The `type` field enables runtime type checking
- **Immutability**: Variables are immutable once created

### Environment (`src/state.ts:32-63`)

The Environment manages the mapping from symbolic variables to concrete values:

```typescript
export class Environment {
  private readonly bindings = new Map<number, unknown>();

  bind<T>(symbolic: Symbolic<T>, value: T): void {
    this.bindings.set(symbolic.id, value);
  }

  lookup<T>(symbolic: Symbolic<T>): T | undefined {
    return this.bindings.get(symbolic.id) as T | undefined;
  }

  reify<T>(variable: Variable<T>): T | undefined {
    if (variable.type === 'concrete') {
      return variable.value;
    }
    return this.lookup(variable);
  }
}
```

**Design decisions:**
- **ID-based storage**: Uses symbolic variable IDs as keys for O(1) lookup
- **Type-safe binding**: Generic parameters ensure type safety during binding
- **Unified interface**: `reify()` works with both symbolic and concrete variables
- **Cloning support**: Environment can be cloned for state exploration

### Command interface (`src/state.ts:92-96`)

Commands encapsulate operations with their preconditions, execution logic, and postconditions:

```typescript
export interface Command<State, Input, Output> {
  generator: (state: State) => Gen<Input> | null;
  executor: (input: Input) => Promise<Output> | Output;
  callbacks: Callback<State, Input, Output>[];
}
```

**Design decisions:**
- **Nullable generator**: Returning `null` indicates the command is not available in the current state
- **Async support**: Executors can be synchronous or asynchronous
- **Callback composition**: Multiple callbacks can be attached to a single command
- **Generic parameters**: Provide type safety for state, input, and output types

### Callback system (`src/state.ts:66-89`)

Three types of callbacks define command behavior:

```typescript
export interface RequireCallback<State, Input> {
  type: 'require';
  check: (state: State, input: Input) => boolean;
}

export interface UpdateCallback<State, Input, Output> {
  type: 'update';
  update: (state: State, input: Input, output: Variable<Output>) => State;
}

export interface EnsureCallback<State, Input, Output> {
  type: 'ensure';
  check: (
    stateBefore: State,
    stateAfter: State,
    input: Input,
    output: Output
  ) => boolean;
}
```

**Design decisions:**
- **Discriminated unions**: The `type` field enables type-safe callback handling
- **Pure functions**: All callbacks are pure functions for predictable behavior
- **Symbolic output in update**: Update callbacks work with symbolic variables during generation
- **Concrete values in ensure**: Postconditions work with concrete values after execution

## Command sequence generation

### Sequential generation (`src/state.ts:147-226`)

The sequential generator creates realistic command sequences:

```typescript
export function sequential<State>(
  range: { min: number; max: number },
  initialState: State,
  commands: Command<State, unknown, unknown>[]
): Gen<Sequential<State>>
```

**Algorithm:**
1. Determine sequence length based on size and range constraints
2. For each position in the sequence:
   - Filter commands that are available (generator returns non-null)
   - Randomly select an available command
   - Generate input using the command's generator
   - Create symbolic output variable
   - Apply update callbacks to evolve state
   - Continue with updated state

**Key implementation details:**
- **State evolution**: State changes during generation to reflect command effects
- **Command availability**: Commands become available/unavailable as state changes
- **Symbolic execution**: Updates use symbolic variables, not concrete execution results
- **Deterministic generation**: Same seed produces same sequence

### Size handling (`src/state.ts:152-159`)

Size handling ensures generated sequences respect both user constraints and generator capabilities:

```typescript
const maxLength = Math.min(range.max, size.value);
const minLength = Math.min(range.min, maxLength);
const lengthGen = Gen.int(Range.uniform(minLength, maxLength));
```

**Design decisions:**
- **Size capping**: Maximum length is constrained by both range and size
- **Range validation**: Ensures min ≤ max before calling Range.uniform
- **Progressive sizing**: Larger sizes tend to generate longer sequences

## Command execution

### Symbolic variable resolution (`src/state.ts:228-283`)

Before execution, symbolic variables must be resolved to concrete values:

```typescript
function resolveInput(input: any, environment: Environment): any {
  if (input && typeof input === 'object') {
    if (input.type === 'symbolic') {
      const resolved = environment.lookup(input);
      if (resolved === undefined) {
        throw new Error(`Unresolved symbolic variable: ${input.toString()}`);
      }
      return resolved;
    }
    // Handle objects/arrays recursively
  }
  return input;
}
```

**Design decisions:**
- **Recursive resolution**: Handles nested objects and arrays containing symbolic variables
- **Error on unresolved**: Throws if a symbolic variable isn't bound in the environment
- **Deep traversal**: Resolves symbolic variables at any nesting level
- **Type preservation**: Non-variable values pass through unchanged

### Execution engine (`src/state.ts:286-369`)

The execution engine runs command sequences with proper validation:

```typescript
export async function executeSequential<State>(
  sequence: Sequential<State>
): Promise<{ success: boolean; failureDetails?: string }>
```

**Execution flow:**
1. Create empty environment for variable bindings
2. For each action in the sequence:
   - Resolve symbolic variables in input and state
   - Check preconditions with resolved values
   - Execute command with resolved input
   - Bind output to symbolic variable in environment
   - Apply state updates using symbolic variables
   - Check postconditions with resolved values
3. Return success/failure with detailed error information

**Error handling:**
- **Precondition failures**: Command cannot execute in current state
- **Postcondition failures**: Command executed but violated invariants
- **Execution errors**: Command threw an exception during execution
- **Resolution errors**: Symbolic variable could not be resolved

## Property testing integration

### Property wrapper (`src/state.ts:372-412`)

The StateMachineProperty class integrates with Hedgehog's property testing:

```typescript
export class StateMachineProperty<State> {
  constructor(private readonly sequenceGen: Gen<Sequential<State>>) {}

  async check(config?: { testLimit?: number; seed?: number }): Promise<{
    ok: boolean;
    counterexample?: Sequential<State>;
    error?: string;
  }>
}
```

**Implementation:**
- **Size progression**: Test cases start small and grow progressively
- **Seed management**: Ensures deterministic test execution
- **Counterexample capture**: Returns failing sequences for debugging
- **Async support**: Handles asynchronous command execution

## Type safety and generics

The implementation uses TypeScript generics extensively for type safety:

```typescript
// Commands are parameterized by State, Input, and Output types
Command<State, Input, Output>

// Variables carry type information
Variable<T> = Symbolic<T> | Concrete<T>

// Generators preserve type relationships
Gen<Sequential<State>>
```

**Benefits:**
- **Compile-time validation**: Type errors are caught at compile time
- **IntelliSense support**: IDEs can provide accurate autocomplete
- **Refactoring safety**: Type system catches breaking changes
- **Self-documenting**: Types serve as documentation

## Performance considerations

### Memory management
- **Immutable state**: State updates create new objects rather than mutating
- **Efficient copying**: Uses spread operators and Map constructors for shallow copying
- **Symbolic variable reuse**: Same symbolic variables can be reused across sequences

### Generation efficiency
- **Early termination**: Sequence generation stops when no commands are available
- **Lazy evaluation**: Command availability is checked just-in-time
- **Bounded retries**: Filter operations have retry limits to prevent infinite loops

### Execution optimization
- **Single pass resolution**: Symbolic variables are resolved once per execution
- **Minimal environment copying**: Environment cloning only happens when needed
- **Efficient variable lookup**: O(1) lookup using numeric IDs

## Design patterns

### Builder pattern
Command creation uses a builder-like pattern with helper functions:

```typescript
const cmd = command(
  generator,
  executor,
  require(precondition),
  update(stateUpdate),
  ensure(postcondition)
);
```

### Strategy pattern
Different callback types implement a strategy pattern for command behavior.

### Template method pattern
The execution engine provides a template for command execution while callbacks customize specific steps.

## Extensibility points

The implementation provides several extension points:

### Custom generators
Users can create domain-specific generators for complex input types.

### Custom callbacks
New callback types can be added by extending the Callback union type.

### Parallel execution
The architecture supports parallel command execution (future enhancement).

### Shrinking strategies
Custom shrinking can be implemented by extending the Tree type.

## Comparison with reference implementations

### Haskell Hedgehog
- **Symbolic variables**: Direct port of Haskell's Var concept
- **Command callbacks**: Mirrors require/update/ensure pattern
- **Two-phase execution**: Identical separation of generation and execution

### Differences from Haskell
- **Async support**: JavaScript's async nature requires Promise handling
- **Type system**: TypeScript's structural typing vs Haskell's nominal typing
- **Memory model**: JavaScript's garbage collection vs Haskell's lazy evaluation

### Rust considerations
- **Ownership**: JavaScript's GC eliminates Rust's ownership concerns
- **Error handling**: Uses exceptions rather than Result types
- **Concurrency**: Single-threaded execution model vs Rust's parallelism

This implementation successfully adapts the functional programming concepts from Haskell while embracing JavaScript/TypeScript idioms and constraints.