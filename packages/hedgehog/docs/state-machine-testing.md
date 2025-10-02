# State Machine Testing

## Quick Start

State machine testing verifies your implementation matches a simplified model by running random sequences of operations.

```typescript
import { command, require, update, ensure, sequential, executeSequential } from '@justanotherdot/hedgehog';

// 1. Define your model state
interface StackState {
  items: number[];
}

// 2. Define commands
const push = command<StackState, { value: number }, string>(
  (_state) => Gen.object({ value: Gen.int(Range.uniform(1, 100)) }),
  async (input) => realStack.push(input.value),
  require(() => true),
  update((state, input, _output) => ({
    items: [...state.items, input.value]
  })),
  ensure((_before, after, input, _output) =>
    realStack.size() === after.items.length
  )
);

// 3. Generate and run test sequences
const prop = forAllSequential(
  sequential(commandRange(1, 100), { items: [] }, [push, pop])
);

await prop.check();
```

## Core Concepts

### Model vs Real

- **Real**: Your actual implementation (what you're testing)
- **Model**: Simplified specification (what *should* happen)
- Test fails when they disagree

The model should be obviously correct - simple enough to trust at a glance.

### Commands vs Actions

- **Command**: Template describing an operation type
- **Action**: Specific instance with concrete input values

```typescript
// Command (template)
const createUser = command(...);

// Actions (instances from generation)
{ command: createUser, input: { name: "Alice" }, output: Var0 }
{ command: createUser, input: { name: "Bob" }, output: Var1 }
```

### Callbacks

Commands have three callbacks executed in order:

1. **require** (precondition): Can this command run? If false, executor doesn't run
2. **update**: Update model state after execution
3. **ensure** (postcondition): Does real match model? If false, test fails

```typescript
const withdraw = command(
  genInput,
  executor,
  require((state, input) =>
    state.balance >= input.amount  // Can only withdraw if funds available
  ),
  update((state, input) => ({
    balance: state.balance - input.amount
  })),
  ensure((before, after, input, output) =>
    realAccount.balance === after.balance  // Real matches model
  )
);
```

## Variables: Forward References

Commands return values used by later commands. During generation, we don't know these values yet.

### How It Works

**Generation Phase** (Symbolic):
```typescript
Action 0: createUser({ name: "Alice" })
  → output: Var0 (placeholder, ID=0)

Action 1: deleteUser({ userId: Var0 })
  → input references Var0
```

**Execution Phase** (Concrete):
```typescript
Action 0: createUser executes → "user-123"
  → Store: Var0 (ID=0) → "user-123"

Action 1: deleteUser executes
  → Resolve Var0 → "user-123"
  → Executor receives: { userId: "user-123" }
```

### Variables in State

Use Variables directly as Map keys or values:

```typescript
interface State {
  users: Map<Variable<string>, User>;  // Variable as key
  // or
  userIds: Map<string, Variable<string>>;  // Variable as value
}

update((state, input, outputVar) => ({
  users: new Map(state.users).set(outputVar, input.user)
}))
```

**Key point**: Variables are compared by object identity, not value. The framework ensures the same Variable instance is reused everywhere for proper Map key lookups.

### Callback Signatures

```typescript
require: (state: State, input: Input) => boolean
  // state: Contains Symbolic during generation, Concrete during execution
  // input: Contains Symbolic/Concrete Variables

update: (state: State, input: Input, output: Variable<Output>) => State
  // state: Current model state with Variables
  // output: Variable representing command result

ensure: (before: State, after: State, input: ResolvedInput, output: Output) => boolean
  // before/after: Resolved state (Variables → values)
  // input: Resolved input (Variables → values)
  // output: Unwrapped result value
```

## Execution Flow

```
For each action:
  1. Check require(state, input)
     → If false: precondition failed

  2. Execute command.executor(input)
     → Returns result

  3. Call update(state, input, outputVar)
     → Update model state

  4. Check ensure(before, after, input, result)
     → If false: bug found!
```

## Parallel Testing

Test concurrent operations by checking all possible interleavings:

```typescript
const parallelGen = parallel(
  commandRange(0, 10),  // Prefix actions
  commandRange(5, 10),  // Branch length
  initialState,
  [createCounter, increment]
);

const prop = forAllParallel(parallelGen);
await prop.check();
```

Parallel execution runs branches concurrently, then verifies at least one interleaving produces valid state.

## Common Patterns

### Resource Creation

```typescript
const create = command<State, Input, ResourceId>(
  genInput,
  async (input) => api.create(input),
  require(() => true),
  update((state, input, idVar) => ({
    resources: new Map(state.resources).set(idVar, input)
  })),
  ensure((before, after) =>
    after.resources.size === before.resources.size + 1
  )
);
```

### Dependent Operations

```typescript
const delete = command<State, { id: Variable<string> }, void>(
  (state) => {
    const ids = Array.from(state.resources.keys());
    return ids.length > 0
      ? Gen.object({ id: Gen.item(ids) })
      : null;  // No resources to delete
  },
  async (input) => api.delete(input.id),
  require((state, input) => state.resources.has(input.id)),
  update((state, input) => {
    const resources = new Map(state.resources);
    resources.delete(input.id);
    return { resources };
  }),
  ensure((before, after) =>
    after.resources.size === before.resources.size - 1
  )
);
```

### Invariant Checking

```typescript
ensure((before, after) => {
  // Check specific postcondition
  const balanceCorrect = after.balance === before.balance + input.amount;

  // Check global invariant
  const balanceNonNegative = after.balance >= 0;

  return balanceCorrect && balanceNonNegative;
})
```

## Tips

1. **Keep models simple** - If you can't verify correctness at a glance, simplify
2. **Test preconditions** - Use `require` to prevent invalid states
3. **Check invariants** - Use `ensure` to verify both specific and global properties
4. **Start sequential** - Get sequential tests working before adding parallel
5. **Use Variables for IDs** - Let the framework handle resolution automatically
