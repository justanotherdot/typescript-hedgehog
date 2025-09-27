# State machine testing

State machine testing is a powerful property-based testing technique for verifying stateful systems. It allows you to test complex interactions between operations while maintaining invariants and checking that your system behaves correctly under all possible sequences of commands.

## Overview

Traditional unit tests verify individual operations in isolation. State machine testing goes further by:

- Testing sequences of operations that can depend on each other
- Automatically generating diverse command sequences
- Verifying preconditions, state transitions, and postconditions
- Shrinking failing test cases to minimal counterexamples
- Handling complex state dependencies elegantly

This is particularly valuable for testing APIs, databases, caches, file systems, and any system where operations have interdependencies.

## Basic concepts

### Commands

A command represents a single operation in your system. Each command has:

- **Generator**: Creates random input data based on current state
- **Executor**: Performs the actual operation
- **Callbacks**: Define preconditions, state updates, and postconditions

### Variables

State machine testing uses a two-phase approach with symbolic and concrete variables:

- **Symbolic variables**: Placeholders (like `Var1`, `Var2`) used during sequence generation
- **Concrete variables**: Real values substituted during execution
- **Environment**: Maps symbolic variables to their concrete values

**Why this matters**: During generation, we create command sequences like "create account → deposit to that account → withdraw from it" without knowing the actual account ID yet. The account creation command outputs a symbolic variable `Var1`, and later commands reference `Var1` as input. During execution, `Var1` gets bound to the real account ID (e.g., `"account_abc123"`), and all commands work with concrete values.

### Sequences

Commands are organized into sequences that represent realistic usage patterns:

- **Sequential**: Commands execute one after another
- **Parallel**: Commands can execute concurrently (future enhancement)

## Quick start

Here's a simple example testing a counter system:

```typescript
import {
  command, require, update, ensure,
  sequential, forAllSequential, commandRange,
  newVar, Gen, Range
} from 'hedgehog';

// Define your state type
interface CounterState {
  counters: Map<Variable<number>, number>;
}

function initialState(): CounterState {
  return { counters: new Map() };
}

// Create counter command
const createCounter = command(
  // Generator: create input based on current state
  (_state) => Gen.object({
    initialValue: Gen.int(Range.uniform(0, 100))
  }),

  // Executor: perform the actual operation
  async (input) => input.initialValue,

  // Precondition: input must be non-negative
  require((_state, input) => input.initialValue >= 0),

  // State update: add new counter to state
  update((state, input, output) => ({
    counters: new Map(state.counters).set(output, input.initialValue)
  })),

  // Postcondition: output matches input
  ensure((_before, _after, input, output) => output === input.initialValue)
);

// Increment counter command
const incrementCounter = command(
  // Generator: pick an existing counter
  (state) => {
    const available = Array.from(state.counters.keys());
    if (available.length === 0) return null; // No counters available

    return Gen.object({
      counter: Gen.item(available)
    });
  },

  // Executor: increment operation
  async (_input) => 1,

  // Precondition: counter must exist
  require((state, input) => state.counters.has(input.counter)),

  // State update: increment the counter
  update((state, input, _output) => {
    const current = state.counters.get(input.counter) ?? 0;
    const newCounters = new Map(state.counters);
    newCounters.set(input.counter, current + 1);
    return { counters: newCounters };
  }),

  // Postcondition: counter was incremented by 1
  ensure((before, after, input, _output) => {
    const oldValue = before.counters.get(input.counter) ?? 0;
    const newValue = after.counters.get(input.counter) ?? 0;
    return newValue === oldValue + 1;
  })
);

// Create and run the property test
const property = forAllSequential(
  sequential(
    commandRange(1, 10),     // Generate 1-10 commands
    initialState(),          // Start with empty state
    [createCounter, incrementCounter] // Available commands
  )
);

// Run the test
await property.check({ testLimit: 100 });
```

## Command callbacks

Commands use a callback system to define their behavior:

### require (Preconditions)

Preconditions check if a command can execute given the current state and input:

```typescript
require((state, input) => {
  // Return true if command can execute
  return state.counters.has(input.counter);
})
```

If a precondition fails, the command is skipped during generation or execution fails during testing.

### update (State transitions)

Updates define how commands modify the state:

```typescript
update((state, input, output) => {
  // Return new state after command execution
  return {
    ...state,
    counters: new Map(state.counters).set(output, input.value)
  };
})
```

The output parameter is a symbolic variable during generation and gets bound to the actual command result during execution.

### ensure (Postconditions)

Postconditions verify that the command behaved correctly:

```typescript
ensure((stateBefore, stateAfter, input, output) => {
  // Return true if the command executed correctly
  return output === input.expectedValue;
})
```

Postcondition failures indicate bugs in your system under test.

## Working with variables

State machine testing uses a two-phase approach:

1. **Generation phase**: Create sequences using symbolic variables
2. **Execution phase**: Run sequences with concrete values

### Creating variables

```typescript
// Create a symbolic variable
const counterId = newVar<number>('counter');

// Create a concrete variable
const concreteId = new Concrete(42);
```

### Variable resolution

The framework automatically resolves symbolic variables during execution:

```typescript
// In your command generator, use symbolic variables
const generator = (state) => Gen.object({
  counter: Gen.item(Array.from(state.counters.keys())) // Returns symbolic variables
});

// During execution, these get resolved to concrete values
// The framework handles this automatically
```

## Advanced patterns

### Conditional command availability

Commands can be conditionally available based on state:

```typescript
const command = command(
  (state) => {
    // Only available if we have accounts with positive balance
    const eligibleAccounts = Array.from(state.accounts.entries())
      .filter(([, info]) => info.balance > 0)
      .map(([account]) => account);

    if (eligibleAccounts.length === 0) return null;

    return Gen.object({
      account: Gen.item(eligibleAccounts),
      amount: Gen.int(Range.uniform(1, 100))
    });
  },
  // ... rest of command
);
```

### Complex state dependencies

Handle interdependent operations by modeling dependencies in your state:

```typescript
interface BankState {
  accounts: Map<Variable<string>, { balance: number; isOpen: boolean }>;
  totalAccounts: number;
}

// Commands can depend on specific state conditions
const withdraw = command(
  (state) => {
    const openAccountsWithFunds = Array.from(state.accounts.entries())
      .filter(([, info]) => info.isOpen && info.balance > 0);

    if (openAccountsWithFunds.length === 0) return null;

    return Gen.object({
      account: Gen.item(openAccountsWithFunds.map(([acc]) => acc)),
      amount: Gen.int(Range.uniform(1, 50))
    });
  },
  // ... executor and callbacks
);
```

### Error conditions

Test error conditions by allowing commands to fail and verifying the failures:

```typescript
const badCommand = command(
  (state) => Gen.object({ amount: Gen.int(Range.uniform(-100, 100)) }),
  async (input) => {
    if (input.amount < 0) throw new Error('Negative amount');
    return input.amount;
  },
  require((_state, input) => input.amount >= 0), // This will catch negatives
  // ... other callbacks
);
```

## Testing configuration

Configure your tests with various options:

```typescript
await property.check({
  testLimit: 100,    // Number of test cases to run
  seed: 42           // Fixed seed for reproducible tests
});
```

## Best practices

1. **Start simple**: Begin with basic commands and add complexity incrementally
2. **Model your domain**: Design state types that accurately represent your system
3. **Use realistic constraints**: Make preconditions match real-world limitations
4. **Test edge cases**: Include commands that test boundary conditions
5. **Keep state focused**: Include only the state necessary for testing
6. **Write clear postconditions**: Ensure postconditions capture the essential behavior
7. **Handle command availability**: Use null returns from generators when commands aren't applicable

## Common patterns

### Resource management
Test creation, usage, and cleanup of resources:

```typescript
const [createResource, useResource, deleteResource] = [
  // Commands that create, use, and clean up resources
];
```

### Session management
Test login, operations, and logout sequences:

```typescript
const [login, performOperation, logout] = [
  // Commands for session lifecycle
];
```

### Cache systems
Test insertion, retrieval, eviction, and invalidation:

```typescript
const [put, get, evict, clear] = [
  // Commands for cache operations
];
```

State machine testing provides a powerful way to verify that your stateful systems behave correctly under all possible usage patterns. Start with simple examples and gradually build up to test complex real-world scenarios.