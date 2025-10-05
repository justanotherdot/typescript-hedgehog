import { describe, it, expect, beforeEach } from 'vitest';
import { Environment, type Variable } from '../state.js';
import {
  command,
  require,
  update,
  ensure,
  executeSequential,
  newVar,
} from '../state.js';
import { Gen } from '../gen.js';
import { Range } from '../data/size.js';

describe('State Machine Internals', () => {
  describe('Interning Cache', () => {
    it('returns same Concrete instance for same value within Environment', () => {
      const env = new Environment();

      const c1 = env.createConcrete('same-value');
      const c2 = env.createConcrete('same-value');

      expect(c1).toBe(c2); // Same object instance
      expect(c1 === c2).toBe(true);
    });

    it('returns different Concrete instances for different values', () => {
      const env = new Environment();

      const c1 = env.createConcrete('value-1');
      const c2 = env.createConcrete('value-2');

      expect(c1).not.toBe(c2);
      expect(c1 === c2).toBe(false);
    });

    it('isolates cache across different Environment instances', () => {
      const env1 = new Environment();
      const env2 = new Environment();

      const c1 = env1.createConcrete('same-value');
      const c2 = env2.createConcrete('same-value');

      // Different environments → different instances even with same value
      expect(c1).not.toBe(c2);
      expect(c1.value).toBe(c2.value); // Same wrapped value
    });

    it('shares cache across cloned Environments', () => {
      const env1 = new Environment();
      const env2 = env1.clone();

      const c1 = env1.createConcrete('shared-value');
      const c2 = env2.createConcrete('shared-value');

      // Cloned env shares cache → same instance
      expect(c1).toBe(c2);
      expect(c1 === c2).toBe(true);
    });

    it('interns objects based on structure', () => {
      const env = new Environment();

      const c1 = env.createConcrete({ x: 1, y: 2 });
      const c2 = env.createConcrete({ x: 1, y: 2 });
      const c3 = env.createConcrete({ x: 1, y: 3 });

      expect(c1).toBe(c2); // Same structure → same instance
      expect(c1).not.toBe(c3); // Different structure → different instance
    });
  });

  describe('Model-SUT Parity', () => {
    let realArray: string[];

    beforeEach(() => {
      realArray = [];
    });

    it('maintains parity with Array structure when executors return values', async () => {
      interface State {
        items: Variable<string>[];
      }

      const addItem = command<State, { value: string }, string>(
        (_state) => Gen.object({ value: Gen.constant('item-1') }),
        async (input) => {
          realArray.push(input.value);
          return input.value;
        },
        require(() => true),
        update((state, input, outputVar) => ({
          items: [...state.items, outputVar],
        })),
        ensure((_before, after, _input, _output) => {
          return after.items.length === realArray.length;
        })
      );

      const sequence = {
        type: 'sequential' as const,
        initialState: { items: [] },
        actions: [
          {
            command: addItem,
            input: { value: 'item-1' },
            output: newVar<string>(),
          },
          {
            command: addItem,
            input: { value: 'item-1' },
            output: newVar<string>(),
          },
          {
            command: addItem,
            input: { value: 'item-1' },
            output: newVar<string>(),
          },
        ],
      };

      const result = await executeSequential(sequence);
      expect(result.success).toBe(true);
      expect(realArray.length).toBe(3);
    });

    it('maintains parity with nested object structures', async () => {
      interface State {
        users: { [key: string]: Variable<string> };
      }

      const realUsers: { [key: string]: string } = {};

      const createUser = command<State, { name: string }, string>(
        (_state) => Gen.object({ name: Gen.constant('Alice') }),
        async (input) => {
          const id = `user-${Object.keys(realUsers).length}`;
          realUsers[id] = input.name;
          return id;
        },
        require(() => true),
        update((state, input, outputVar) => {
          const userId =
            outputVar.type === 'symbolic'
              ? outputVar.toString()
              : outputVar.value;
          return {
            users: { ...state.users, [userId]: outputVar },
          };
        }),
        ensure((_before, after, _input, _output) => {
          return (
            Object.keys(after.users).length === Object.keys(realUsers).length
          );
        })
      );

      const sequence = {
        type: 'sequential' as const,
        initialState: { users: {} },
        actions: [
          {
            command: createUser,
            input: { name: 'Alice' },
            output: newVar<string>(),
          },
          {
            command: createUser,
            input: { name: 'Bob' },
            output: newVar<string>(),
          },
        ],
      };

      const result = await executeSequential(sequence);
      expect(result.success).toBe(true);
      expect(Object.keys(realUsers).length).toBe(2);
    });

    it('maintains parity when same value is returned multiple times (Array)', async () => {
      interface State {
        items: Variable<string>[];
      }

      const realItems: string[] = [];

      const addItem = command<State, { id: string }, string>(
        (_state) => Gen.object({ id: Gen.constant('duplicate-id') }),
        async (input) => {
          realItems.push(input.id);
          return input.id;
        },
        require(() => true),
        update((state, _input, outputVar) => ({
          items: [...state.items, outputVar],
        })),
        ensure((_before, after, _input, _output) => {
          // After resolution, both should have same length
          // Even though Variables are different objects, values are same
          return after.items.length === realItems.length;
        })
      );

      const sequence = {
        type: 'sequential' as const,
        initialState: { items: [] },
        actions: [
          {
            command: addItem,
            input: { id: 'duplicate-id' },
            output: newVar<string>(),
          },
          {
            command: addItem,
            input: { id: 'duplicate-id' },
            output: newVar<string>(),
          },
          {
            command: addItem,
            input: { id: 'duplicate-id' },
            output: newVar<string>(),
          },
        ],
      };

      const result = await executeSequential(sequence);
      expect(result.success).toBe(true);
      expect(realItems.length).toBe(3);
    });

    it('maintains parity with complex nested structures', async () => {
      interface State {
        teams: Map<string, { members: Variable<string>[] }>;
      }

      const realTeams = new Map<string, { members: string[] }>();

      const addMember = command<
        State,
        { teamId: string; name: string },
        string
      >(
        (_state) =>
          Gen.object({
            teamId: Gen.constant('team-1'),
            name: Gen.constant('Alice'),
          }),
        async (input) => {
          const memberId = `member-${Math.random()}`;
          const team = realTeams.get(input.teamId) || { members: [] };
          team.members.push(memberId);
          realTeams.set(input.teamId, team);
          return memberId;
        },
        require(() => true),
        update((state, input, outputVar) => {
          const teams = new Map(state.teams);
          const team = teams.get(input.teamId) || { members: [] };
          team.members = [...team.members, outputVar];
          teams.set(input.teamId, team);
          return { teams };
        }),
        ensure((_before, after, input, _output) => {
          const modelTeam = after.teams.get(input.teamId);
          const realTeam = realTeams.get(input.teamId);
          return (
            modelTeam !== undefined &&
            realTeam !== undefined &&
            modelTeam.members.length === realTeam.members.length
          );
        })
      );

      const sequence = {
        type: 'sequential' as const,
        initialState: { teams: new Map() },
        actions: [
          {
            command: addMember,
            input: { teamId: 'team-1', name: 'Alice' },
            output: newVar<string>(),
          },
          {
            command: addMember,
            input: { teamId: 'team-1', name: 'Bob' },
            output: newVar<string>(),
          },
          {
            command: addMember,
            input: { teamId: 'team-1', name: 'Charlie' },
            output: newVar<string>(),
          },
        ],
      };

      const result = await executeSequential(sequence);
      expect(result.success).toBe(true);

      const realTeam = realTeams.get('team-1');
      expect(realTeam?.members.length).toBe(3);
    });

    it('verifies interning prevents model divergence with duplicate Map keys', async () => {
      interface State {
        items: Map<Variable<string>, number>;
      }

      const realMap = new Map<string, number>();
      let callCount = 0;

      const addItem = command<State, { value: number }, string>(
        (_state) => Gen.object({ value: Gen.int(Range.uniform(1, 100)) }),
        async (input) => {
          callCount++;
          // First two calls return same ID
          const id = callCount <= 2 ? 'duplicate-id' : `id-${callCount}`;
          realMap.set(id, input.value);
          return id;
        },
        require(() => true),
        update((state, input, outputVar) => {
          const items = new Map(state.items);
          items.set(outputVar, input.value);
          return { items };
        }),
        ensure((_before, after, _input, _output) => {
          // Critical: After resolution, Map<Variable, Data> should have same size as Map<string, Data>
          // Interning ensures duplicate IDs create same Concrete instance
          return after.items.size === realMap.size;
        })
      );

      const sequence = {
        type: 'sequential' as const,
        initialState: { items: new Map() },
        actions: [
          { command: addItem, input: { value: 100 }, output: newVar<string>() },
          { command: addItem, input: { value: 200 }, output: newVar<string>() },
          { command: addItem, input: { value: 300 }, output: newVar<string>() },
        ],
      };

      const result = await executeSequential(sequence);
      expect(result.success).toBe(true);
      // First two actions return "duplicate-id", third returns "id-3"
      // Both model and real should have 2 entries
      expect(realMap.size).toBe(2);
    });
  });
});
