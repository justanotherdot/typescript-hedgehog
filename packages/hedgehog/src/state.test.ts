import { describe, it, expect } from 'vitest';
import { Gen } from './gen.js';
import { Range } from './data/size.js';
import {
  Concrete,
  Environment,
  sequential,
  executeSequential,
  forAllSequential,
  command,
  require,
  update,
  ensure,
  commandRange,
  newVar,
  Command,
  Variable,
} from './state.js';

// Example: Testing a simple counter system
interface CounterState {
  counters: Map<Variable<number>, number>;
}

function initialCounterState(): CounterState {
  return { counters: new Map() };
}

// Create counter command
const createCounter: Command<CounterState, { initialValue: number }, number> =
  command(
    (_state) => Gen.object({ initialValue: Gen.int(Range.uniform(0, 100)) }),
    async (input) => input.initialValue,
    require((_state, input) => input.initialValue >= 0),
    update((state, input, output) => ({
      counters: new Map(state.counters).set(output, input.initialValue),
    })),
    ensure(
      (_stateBefore, _stateAfter, input, output) =>
        output === input.initialValue
    )
  );

// Increment counter command
const incrementCounter: Command<
  CounterState,
  { counter: Variable<number> },
  number
> = command(
  (state) => {
    const availableCounters = Array.from(state.counters.keys());
    if (availableCounters.length === 0) return null;

    return Gen.object({
      counter: Gen.item(availableCounters),
    });
  },
  async (_input) => {
    // This would increment in the real system
    return 1; // Simplified for testing
  },
  require((state, input) => state.counters.has(input.counter)),
  update((state, input, _output) => {
    const currentValue = state.counters.get(input.counter) ?? 0;
    const newCounters = new Map(state.counters);
    newCounters.set(input.counter, currentValue + 1);
    return { counters: newCounters };
  }),
  ensure((stateBefore, stateAfter, input, _output) => {
    const oldValue = stateBefore.counters.get(input.counter) ?? 0;
    const newValue = stateAfter.counters.get(input.counter) ?? 0;
    return newValue === oldValue + 1;
  })
);

// Read counter command
const readCounter: Command<
  CounterState,
  { counter: Variable<number> },
  number
> = command(
  (state) => {
    const availableCounters = Array.from(state.counters.keys());
    if (availableCounters.length === 0) return null;

    return Gen.object({
      counter: Gen.item(availableCounters),
    });
  },
  async (_input) => {
    // This would read from the real system
    return 42; // Simplified for testing
  },
  require((state, input) => state.counters.has(input.counter)),
  update((state, _input, _output) => state), // Read doesn't change state
  ensure((stateBefore, _stateAfter, input, output) => {
    const expectedValue = stateBefore.counters.get(input.counter) ?? 0;
    return output === expectedValue;
  })
);

describe('State Machine Testing', () => {
  describe('Variable System', () => {
    it('should create symbolic variables with unique IDs', () => {
      const var1 = newVar<string>('string');
      const var2 = newVar<number>('number');

      expect(var1.id).not.toBe(var2.id);
      expect(var1.type).toBe('symbolic');
      expect(var2.type).toBe('symbolic');
    });

    it('should handle concrete variables', () => {
      const concrete = new Concrete(42);
      expect(concrete.type).toBe('concrete');
      expect(concrete.value).toBe(42);
    });
  });

  describe('Environment', () => {
    it('should bind and lookup symbolic variables', () => {
      const env = new Environment();
      const sym = newVar<string>('test');

      env.bind(sym, 'hello');
      expect(env.lookup(sym)).toBe('hello');
      expect(env.has(sym)).toBe(true);
    });

    it('should reify variables correctly', () => {
      const env = new Environment();
      const sym = newVar<number>('number');
      const concrete = new Concrete(123);

      env.bind(sym, 456);

      expect(env.reify(sym)).toBe(456);
      expect(env.reify(concrete)).toBe(123);
    });

    it('should clone environments', () => {
      const env1 = new Environment();
      const sym = newVar<string>('test');

      env1.bind(sym, 'original');
      const env2 = env1.clone();

      env2.bind(sym, 'modified');

      expect(env1.lookup(sym)).toBe('original');
      expect(env2.lookup(sym)).toBe('modified');
    });
  });

  describe('Command Generation', () => {
    it('should generate valid command sequences', () => {
      const sequenceGen = sequential(
        commandRange(1, 5),
        initialCounterState(),
        [createCounter, incrementCounter, readCounter]
      );

      const sequence = sequenceGen.sample();

      expect(sequence.type).toBe('sequential');
      expect(sequence.actions.length).toBeGreaterThan(0);
      expect(sequence.actions.length).toBeLessThanOrEqual(5);
    });

    it('should respect command preconditions', () => {
      const sequenceGen = sequential(
        commandRange(3, 3),
        initialCounterState(),
        [createCounter, incrementCounter] // increment requires existing counter
      );

      const sequence = sequenceGen.sample();

      // First action should be createCounter since incrementCounter requires existing counters
      expect(sequence.actions[0].command).toBe(createCounter);
    });
  });

  describe('Command Execution', () => {
    it('should execute simple sequences successfully', async () => {
      // Create a simple sequence manually for testing
      const mockCreateAction = {
        input: { initialValue: 5 },
        output: newVar<number>('counter'),
        command: createCounter,
      };

      const sequence = {
        type: 'sequential' as const,
        actions: [mockCreateAction],
        initialState: initialCounterState(),
      };

      const result = await executeSequential(sequence);
      expect(result.success).toBe(true);
    });

    it('should fail when preconditions are violated', async () => {
      // Create a sequence that violates preconditions by using a concrete non-existent counter
      const nonExistentCounter = new Concrete<number>(999); // Use concrete value instead
      const mockIncrementAction = {
        input: { counter: nonExistentCounter },
        output: newVar<number>('result'),
        command: incrementCounter,
      };

      const sequence = {
        type: 'sequential' as const,
        actions: [mockIncrementAction],
        initialState: initialCounterState(),
      };

      const result = await executeSequential(sequence);
      expect(result.success).toBe(false);
      expect(result.failureDetails).toContain('Precondition failed');
    });
  });

  describe('Property-based State Machine Testing', () => {
    it('should create properties for state machine testing', () => {
      const property = forAllSequential(
        sequential(commandRange(1, 3), initialCounterState(), [createCounter])
      );

      // Test the property (this is a simplified test)
      expect(property).toBeDefined();
    });
  });

  describe('Callback System', () => {
    it('should create require callbacks', () => {
      const callback = require<CounterState, { value: number }>(
        (state, input) => input.value > 0
      );
      expect(callback.type).toBe('require');
      expect(callback.check({ counters: new Map() }, { value: 5 })).toBe(true);
      expect(callback.check({ counters: new Map() }, { value: -1 })).toBe(
        false
      );
    });

    it('should create update callbacks', () => {
      const callback = update<CounterState, { value: number }, string>(
        (state, _input, _output) => ({ ...state, counters: new Map() })
      );
      expect(callback.type).toBe('update');
    });

    it('should create ensure callbacks', () => {
      const callback = ensure<CounterState, { value: number }, string>(
        (_before, _after, _input, output) => output.length > 0
      );
      expect(callback.type).toBe('ensure');
    });
  });
});

// Example: Testing a simple key-value store
interface KVState {
  store: Map<string, Variable<string>>;
}

function initialKVState(): KVState {
  return { store: new Map() };
}

const putKV: Command<KVState, { key: string; value: string }, string> = command(
  (_state) =>
    Gen.object({
      key: Gen.string(),
      value: Gen.string(),
    }),
  async (input) => input.value,
  require((_state, input) => input.key.length > 0),
  update((state, input, output) => ({
    store: new Map(state.store).set(input.key, output),
  })),
  ensure((_stateBefore, _stateAfter, input, output) => output === input.value)
);

const getKV: Command<KVState, { key: string }, string | null> = command(
  (state) => {
    const availableKeys = Array.from(state.store.keys());
    if (availableKeys.length === 0) return null;

    return Gen.object({
      key: Gen.item(availableKeys),
    });
  },
  async (_input) => {
    // This would read from the real system
    return 'mock-value';
  },
  require((state, input) => state.store.has(input.key)),
  update((state, _input, _output) => state), // Get doesn't change state
  ensure((_stateBefore, _stateAfter, _input, output) => {
    // In a real implementation, we'd check that the output matches stored value
    return output !== null;
  })
);

describe('Key-Value Store Example', () => {
  it('should generate valid KV store operations', () => {
    const sequenceGen = sequential(commandRange(2, 5), initialKVState(), [
      putKV,
      getKV,
    ]);

    const sequence = sequenceGen.sample();
    expect(sequence.actions.length).toBeGreaterThan(0);

    // Should start with put operations since get requires existing keys
    const firstAction = sequence.actions[0];
    expect(firstAction.command).toBe(putKV);
  });

  it('should execute KV store sequences', async () => {
    const mockPutAction = {
      input: { key: 'test-key', value: 'test-value' },
      output: newVar<string>('stored-value'),
      command: putKV,
    };

    const sequence = {
      type: 'sequential' as const,
      actions: [mockPutAction],
      initialState: initialKVState(),
    };

    const result = await executeSequential(sequence);
    expect(result.success).toBe(true);
  });
});
