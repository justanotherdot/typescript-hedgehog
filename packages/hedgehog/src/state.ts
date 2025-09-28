import { Gen } from './gen.js';
import { Size, Range } from './data/size.js';
import { Tree } from './data/tree.js';
import { Seed } from './data/seed.js';

// Variable system for symbolic/concrete duality
let nextSymbolicId = 0;

export class Symbolic<_T> {
  readonly type = 'symbolic' as const;
  readonly id: number;
  readonly typeName: string;

  constructor(typeName: string) {
    this.id = nextSymbolicId++;
    this.typeName = typeName;
  }

  toString(): string {
    return `Var${this.id}`;
  }
}

export class Concrete<T> {
  readonly type = 'concrete' as const;

  constructor(readonly value: T) {}
}

export type Variable<T> = Symbolic<T> | Concrete<T>;

// Environment maps symbolic variables to concrete values
export class Environment {
  private readonly bindings = new Map<number, unknown>();

  bind<T>(symbolic: Symbolic<T>, value: T): void {
    this.bindings.set(symbolic.id, value);
  }

  lookup<T>(symbolic: Symbolic<T>): T | undefined {
    return this.bindings.get(symbolic.id) as T | undefined;
  }

  has(symbolic: Symbolic<unknown>): boolean {
    return this.bindings.has(symbolic.id);
  }

  reify<T>(variable: Variable<T>): T | undefined {
    if (variable.type === 'concrete') {
      return variable.value;
    }
    return this.lookup(variable);
  }

  clone(): Environment {
    const env = new Environment();
    env.bindings.clear();
    for (const [id, value] of this.bindings) {
      env.bindings.set(id, value);
    }
    return env;
  }
}

// Callback types for command specification
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

export type Callback<State, Input, Output> =
  | RequireCallback<State, Input>
  | UpdateCallback<State, Input, Output>
  | EnsureCallback<State, Input, Output>;

// Command specification
export interface Command<State, Input, Output> {
  generator: (state: State) => Gen<Input> | null;
  executor: (input: Input) => Promise<Output> | Output;
  callbacks: Callback<State, Input, Output>[];
}

// Helper functions for creating callbacks
export function require<State, Input>(
  check: (state: State, input: Input) => boolean
): RequireCallback<State, Input> {
  return { type: 'require', check };
}

export function update<State, Input, Output>(
  updateFn: (state: State, input: Input, output: Variable<Output>) => State
): UpdateCallback<State, Input, Output> {
  return { type: 'update', update: updateFn };
}

export function ensure<State, Input, Output>(
  check: (
    stateBefore: State,
    stateAfter: State,
    input: Input,
    output: Output
  ) => boolean
): EnsureCallback<State, Input, Output> {
  return { type: 'ensure', check };
}

// Action represents a concrete command instance
export interface Action<State, Input, Output> {
  readonly input: Input;
  readonly output: Symbolic<Output>;
  readonly command: Command<State, Input, Output>;
}

// Command sequence types
export interface Sequential<State> {
  readonly type: 'sequential';
  readonly actions: Action<State, unknown, unknown>[];
  readonly initialState: State;
}

export interface Parallel<State> {
  readonly type: 'parallel';
  readonly prefix: Action<State, unknown, unknown>[];
  readonly branches: [
    Action<State, unknown, unknown>[],
    Action<State, unknown, unknown>[],
  ];
  readonly initialState: State;
}

// State machine testing generator
export function sequential<State>(
  range: { min: number; max: number },
  initialState: State,
  commands: Command<State, unknown, unknown>[]
): Gen<Sequential<State>> {
  return Gen.sized((size) => {
    const maxLength = Math.min(range.max, size.value);
    const minLength = Math.min(range.min, maxLength);
    const lengthGen = Gen.int(Range.uniform(minLength, maxLength));
    return lengthGen.bind((length) =>
      generateSequence(length, initialState, commands)
    );
  });
}

function generateSequence<State>(
  length: number,
  initialState: State,
  commands: Command<State, unknown, unknown>[]
): Gen<Sequential<State>> {
  return Gen.create((size, seed) => {
    const actions: Action<State, unknown, unknown>[] = [];
    let currentState = initialState;
    let currentSeed = seed;

    for (let i = 0; i < length; i++) {
      const availableCommands = commands.filter(
        (cmd) => cmd.generator(currentState) !== null
      );

      if (availableCommands.length === 0) {
        break;
      }

      // Choose a command
      const [commandIndex, seed1] = currentSeed.nextBounded(
        availableCommands.length
      );
      const command = availableCommands[commandIndex];

      // Generate input
      const inputGen = command.generator(currentState);
      if (!inputGen) {
        continue;
      }

      const [, seed2] = seed1.split();
      const inputTree = inputGen.generate(size, seed2);
      const input = inputTree.value;

      // Create action
      const output = new Symbolic<unknown>('unknown');
      const action: Action<State, unknown, unknown> = {
        input,
        output,
        command,
      };

      actions.push(action);

      // Apply update callbacks to state
      for (const callback of command.callbacks) {
        if (callback.type === 'update') {
          currentState = callback.update(currentState, input, output);
        }
      }

      const [, seed3] = seed2.split();
      currentSeed = seed3;
    }

    const result: Sequential<State> = {
      type: 'sequential',
      actions,
      initialState,
    };

    return Tree.singleton(result);
  });
}

// Helper function to resolve symbolic variables in inputs
function resolveInput(input: any, environment: Environment): any {
  if (input && typeof input === 'object') {
    if (input.type === 'symbolic') {
      const resolved = environment.lookup(input);
      if (resolved === undefined) {
        throw new Error(`Unresolved symbolic variable: ${input.toString()}`);
      }
      return resolved;
    }

    if (input.type === 'concrete') {
      return input.value;
    }

    // Handle objects/arrays recursively
    if (Array.isArray(input)) {
      return input.map((item) => resolveInput(item, environment));
    }

    const resolved: any = {};
    for (const [key, value] of Object.entries(input)) {
      resolved[key] = resolveInput(value, environment);
    }
    return resolved;
  }

  return input;
}

// Helper function to resolve symbolic variables in state
function resolveState(state: any, environment: Environment): any {
  if (state && typeof state === 'object') {
    if (state instanceof Map) {
      const resolved = new Map();
      for (const [key, value] of state.entries()) {
        const resolvedKey = resolveInput(key, environment);
        const resolvedValue = resolveInput(value, environment);
        resolved.set(resolvedKey, resolvedValue);
      }
      return resolved;
    }

    if (Array.isArray(state)) {
      return state.map((item) => resolveState(item, environment));
    }

    const resolved: any = {};
    for (const [key, value] of Object.entries(state)) {
      resolved[key] = resolveState(value, environment);
    }
    return resolved;
  }

  return state;
}

// Execution engine
export async function executeSequential<State>(
  sequence: Sequential<State>
): Promise<{ success: boolean; failureDetails?: string }> {
  const environment = new Environment();
  let currentState = sequence.initialState;

  for (let i = 0; i < sequence.actions.length; i++) {
    const action = sequence.actions[i];

    try {
      // Resolve symbolic variables in the input
      const resolvedInput = resolveInput(action.input, environment);

      // Resolve symbolic variables in the current state for precondition checking
      const resolvedState = resolveState(currentState, environment);

      // Check require callbacks with resolved values
      for (const callback of action.command.callbacks) {
        if (callback.type === 'require') {
          if (!callback.check(resolvedState, resolvedInput)) {
            return {
              success: false,
              failureDetails: `Precondition failed at action ${i}`,
            };
          }
        }
      }

      // Execute the command with resolved input
      const result = await action.command.executor(resolvedInput);
      environment.bind(action.output, result);

      const stateBefore = currentState;

      // Apply update callbacks (using symbolic state and symbolic variables)
      for (const callback of action.command.callbacks) {
        if (callback.type === 'update') {
          currentState = callback.update(
            currentState,
            action.input,
            action.output
          );
        }
      }

      // Resolve state again for postcondition checking
      const resolvedStateBefore = resolveState(stateBefore, environment);
      const resolvedStateAfter = resolveState(currentState, environment);

      // Check ensure callbacks with resolved values
      for (const callback of action.command.callbacks) {
        if (callback.type === 'ensure') {
          if (
            !callback.check(
              resolvedStateBefore,
              resolvedStateAfter,
              resolvedInput,
              result
            )
          ) {
            return {
              success: false,
              failureDetails: `Postcondition failed at action ${i}: ${JSON.stringify(
                {
                  input: resolvedInput,
                  output: result,
                  stateBefore: resolvedStateBefore,
                  stateAfter: resolvedStateAfter,
                }
              )}`,
            };
          }
        }
      }
    } catch (error) {
      return {
        success: false,
        failureDetails: `Action ${i} threw error: ${error}`,
      };
    }
  }

  return { success: true };
}

// Property-based test creation for state machine testing
export class StateMachineProperty<State> {
  constructor(private readonly sequenceGen: Gen<Sequential<State>>) {}

  async check(config?: { testLimit?: number; seed?: number }): Promise<{
    ok: boolean;
    counterexample?: Sequential<State>;
    error?: string;
  }> {
    const testLimit = config?.testLimit ?? 100;
    const seed = config?.seed ?? Math.floor(Math.random() * 2 ** 32);
    let currentSeed = Seed.fromNumber(seed);

    for (let i = 0; i < testLimit; i++) {
      const size = Size.of(Math.min(i, 100));
      const tree = this.sequenceGen.generate(size, currentSeed);
      const sequence = tree.value;

      try {
        const result = await executeSequential(sequence);
        if (!result.success) {
          return {
            ok: false,
            counterexample: sequence,
            error: result.failureDetails ?? 'Unknown failure',
          };
        }
      } catch (error) {
        return {
          ok: false,
          counterexample: sequence,
          error: `Execution error: ${error}`,
        };
      }

      const [, newSeed] = currentSeed.split();
      currentSeed = newSeed;
    }

    return { ok: true };
  }
}

export function forAllSequential<State>(
  sequenceGen: Gen<Sequential<State>>
): StateMachineProperty<State> {
  return new StateMachineProperty(sequenceGen);
}

// Range helper
export function commandRange(
  min: number,
  max: number
): { min: number; max: number } {
  return { min, max };
}

// Variable creation helper
export function newVar<T>(typeName: string = 'T'): Symbolic<T> {
  return new Symbolic<T>(typeName);
}

// Type-safe command builders
export function command<State, Input, Output>(
  generator: (state: State) => Gen<Input> | null,
  executor: (input: Input) => Promise<Output> | Output,
  ...callbacks: Callback<State, Input, Output>[]
): Command<State, Input, Output> {
  return {
    generator,
    executor,
    callbacks,
  };
}
