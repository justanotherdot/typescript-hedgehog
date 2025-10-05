import { describe, it, expect } from 'vitest';
import { Gen } from './gen.js';
import {
  command,
  require,
  update,
  ensure,
  executeSequential,
  type Variable,
} from './state.js';

/**
 * Test: Map<Variable<string>, Data>
 *
 * This tests Variables as Map KEYS. If executors return duplicate values,
 * what happens?
 */
describe('Map<Variable, Data> - Variables as Keys', () => {
  it('shows behavior when executors return duplicate IDs', async () => {
    interface State {
      items: Map<Variable<string>, number>;
    }

    let callCount = 0;
    const realMap = new Map<string, number>();

    const addItem = command<State, { value: number }, string>(
      (_state) => Gen.object({ value: Gen.constant(100) }),
      async (input) => {
        callCount++;
        // Return SAME ID for first two calls
        const id = callCount <= 2 ? 'duplicate-id' : `id-${callCount}`;
        realMap.set(id, input.value);
        console.log(`[Executor ${callCount}] Returning ID: "${id}"`);
        return id;
      },
      require(() => true),
      update((state, input, idVar) => {
        const newItems = new Map(state.items);
        newItems.set(idVar, input.value);
        console.log(
          `[Update] Added with key ${idVar.toString()}, map size: ${newItems.size}`
        );
        return { items: newItems };
      }),
      ensure((_before, after, _input, _output) => {
        console.log(
          `[Ensure] Model size: ${after.items.size}, Real size: ${realMap.size}`
        );
        return after.items.size === realMap.size;
      })
    );

    const sequence = {
      type: 'sequential' as const,
      initialState: { items: new Map() },
      actions: [
        {
          command: addItem,
          input: { value: 100 },
          output: { type: 'symbolic' as const, id: 0, typeName: 'string' },
        },
        {
          command: addItem,
          input: { value: 200 },
          output: { type: 'symbolic' as const, id: 1, typeName: 'string' },
        },
      ],
    };

    console.log('\n=== Map<Variable<string>, number> Test ===\n');
    const result = await executeSequential(sequence);

    console.log(`\nFinal Result: ${result.success ? 'PASS' : 'FAIL'}`);
    console.log(`Model map size: ${sequence.initialState.items.size}`);
    console.log(`Real map size: ${realMap.size}`);
    console.log(
      '\nExpected: Both should have 1 entry (duplicate ID overwrites)'
    );
    console.log(
      `Actual: Model=${sequence.initialState.items.size}, Real=${realMap.size}`
    );

    // What's the actual behavior?
    expect(result.success).toBeDefined();
  });
});

/**
 * Test: Map<string, Variable<number>>
 *
 * This tests Variables as Map VALUES. String keys, Variable values.
 */
describe('Map<string, Variable<Data>> - Variables as Values', () => {
  it('shows behavior when same key is used twice', async () => {
    interface State {
      items: Map<string, Variable<number>>;
    }

    const realMap = new Map<string, number>();

    const addItem = command<State, { key: string; value: number }, number>(
      (_state) =>
        Gen.object({
          key: Gen.constant('same-key'), // Always use same key
          value: Gen.constant(100),
        }),
      async (input) => {
        realMap.set(input.key, input.value);
        console.log(
          `[Executor] Set "${input.key}" = ${input.value}, map size: ${realMap.size}`
        );
        return input.value;
      },
      require(() => true),
      update((state, input, valueVar) => {
        const newItems = new Map(state.items);
        newItems.set(input.key, valueVar); // String key, Variable value
        console.log(
          `[Update] Set "${input.key}" = ${valueVar.toString()}, map size: ${newItems.size}`
        );
        return { items: newItems };
      }),
      ensure((_before, after, _input, _output) => {
        console.log(
          `[Ensure] Model size: ${after.items.size}, Real size: ${realMap.size}`
        );
        return after.items.size === realMap.size;
      })
    );

    const sequence = {
      type: 'sequential' as const,
      initialState: { items: new Map() },
      actions: [
        {
          command: addItem,
          input: { key: 'same-key', value: 100 },
          output: { type: 'symbolic' as const, id: 0, typeName: 'number' },
        },
        {
          command: addItem,
          input: { key: 'same-key', value: 200 },
          output: { type: 'symbolic' as const, id: 1, typeName: 'number' },
        },
      ],
    };

    console.log('\n=== Map<string, Variable<number>> Test ===\n');
    const result = await executeSequential(sequence);

    console.log(`\nFinal Result: ${result.success ? 'PASS' : 'FAIL'}`);
    console.log('\nExpected: Both should have 1 entry (same key overwrites)');
    console.log(
      `Actual: Model=${sequence.initialState.items.size}, Real=${realMap.size}`
    );

    expect(result.success).toBeDefined();
  });
});
