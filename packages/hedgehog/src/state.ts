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

// Parallel state machine testing
export function parallel<State>(
  prefixRange: { min: number; max: number },
  branchRange: { min: number; max: number },
  initialState: State,
  commands: Command<State, unknown, unknown>[]
): Gen<Parallel<State>> {
  return Gen.sized((size) => {
    const maxPrefixLength = Math.min(prefixRange.max, size.value);
    const minPrefixLength = Math.min(prefixRange.min, maxPrefixLength);
    const prefixLengthGen = Gen.int(Range.uniform(minPrefixLength, maxPrefixLength));

    const maxBranchLength = Math.min(branchRange.max, size.value);
    const minBranchLength = Math.min(branchRange.min, maxBranchLength);
    const branchLengthGen = Gen.int(Range.uniform(minBranchLength, maxBranchLength));

    return prefixLengthGen.bind((prefixLength) =>
      branchLengthGen.bind((branchLength) =>
        generateParallelSequence(prefixLength, branchLength, initialState, commands)
      )
    );
  });
}

function generateParallelSequence<State>(
  prefixLength: number,
  branchLength: number,
  initialState: State,
  commands: Command<State, unknown, unknown>[]
): Gen<Parallel<State>> {
  return Gen.create((size, seed) => {
    // Generate prefix actions
    const prefixActions: Action<State, unknown, unknown>[] = [];
    let currentState = initialState;
    let currentSeed = seed;

    for (let i = 0; i < prefixLength; i++) {
      const availableCommands = commands.filter(
        (cmd) => cmd.generator(currentState) !== null
      );

      if (availableCommands.length === 0) {
        break;
      }

      const [commandIndex, seed1] = currentSeed.nextBounded(availableCommands.length);
      const command = availableCommands[commandIndex];
      const inputGen = command.generator(currentState);

      if (!inputGen) {
        continue;
      }

      const [, seed2] = seed1.split();
      const inputTree = inputGen.generate(size, seed2);
      const input = inputTree.value;

      const output = new Symbolic<unknown>('unknown');
      const action: Action<State, unknown, unknown> = {
        input,
        output,
        command,
      };

      prefixActions.push(action);

      // Apply update callbacks
      for (const callback of command.callbacks) {
        if (callback.type === 'update') {
          currentState = callback.update(currentState, input, output);
        }
      }

      const [, seed3] = seed2.split();
      currentSeed = seed3;
    }

    // Generate branch actions starting from the state after prefix
    const [branch1Seed, branch2Seed] = currentSeed.split();
    const branch1Actions = generateBranchActions(branchLength, currentState, commands, size, branch1Seed);
    const branch2Actions = generateBranchActions(branchLength, currentState, commands, size, branch2Seed);

    const result: Parallel<State> = {
      type: 'parallel',
      prefix: prefixActions,
      branches: [branch1Actions, branch2Actions],
      initialState,
    };

    return Tree.singleton(result);
  });
}

function generateBranchActions<State>(
  length: number,
  initialState: State,
  commands: Command<State, unknown, unknown>[],
  size: Size,
  seed: Seed
): Action<State, unknown, unknown>[] {
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

    const [commandIndex, seed1] = currentSeed.nextBounded(availableCommands.length);
    const command = availableCommands[commandIndex];
    const inputGen = command.generator(currentState);

    if (!inputGen) {
      continue;
    }

    const [, seed2] = seed1.split();
    const inputTree = inputGen.generate(size, seed2);
    const input = inputTree.value;

    const output = new Symbolic<unknown>('unknown');
    const action: Action<State, unknown, unknown> = {
      input,
      output,
      command,
    };

    actions.push(action);

    // Apply update callbacks
    for (const callback of command.callbacks) {
      if (callback.type === 'update') {
        currentState = callback.update(currentState, input, output);
      }
    }

    const [, seed3] = seed2.split();
    currentSeed = seed3;
  }

  return actions;
}

// Interleaving algorithm (like Haskell's)
function interleave<T>(xs: T[], ys: T[]): T[][] {
  if (xs.length === 0 && ys.length === 0) {
    return [[]];
  }
  if (xs.length === 0) {
    return [ys];
  }
  if (ys.length === 0) {
    return [xs];
  }

  const [x, ...xsRest] = xs;
  const [y, ...ysRest] = ys;

  const result: T[][] = [];

  // x goes first
  for (const interleaving of interleave(xsRest, ys)) {
    result.push([x, ...interleaving]);
  }

  // y goes first
  for (const interleaving of interleave(xs, ysRest)) {
    result.push([y, ...interleaving]);
  }

  return result;
}

// Execute actions and check postconditions
interface ActionExecution<State> {
  readonly action: Action<State, unknown, unknown>;
  readonly result: unknown;
  readonly success: boolean;
  readonly error?: string;
}


// Linearization check
async function linearize<State>(
  initialState: State,
  branch1Executions: ActionExecution<State>[],
  branch2Executions: ActionExecution<State>[]
): Promise<{ success: boolean; error?: string }> {
  // Extract actions from executions
  const branch1Actions = branch1Executions.map(exec => exec.action);
  const branch2Actions = branch2Executions.map(exec => exec.action);

  // Create a mapping of action outputs to their actual results
  const resultMapping = new Map<Symbolic<unknown>, unknown>();
  for (const exec of branch1Executions) {
    if (exec.success) {
      resultMapping.set(exec.action.output, exec.result);
    }
  }
  for (const exec of branch2Executions) {
    if (exec.success) {
      resultMapping.set(exec.action.output, exec.result);
    }
  }

  // Generate all possible interleavings
  const interleavings = interleave(branch1Actions, branch2Actions);

  // Try each interleaving to see if any satisfies all conditions
  for (const interleaving of interleavings) {
    const environment = new Environment();
    let currentState = initialState;
    let interleavingValid = true;

    // Execute each action in the interleaving
    for (const action of interleaving) {
      try {
        // Resolve input
        const resolvedInput = resolveInput(action.input, environment);
        const resolvedState = resolveState(currentState, environment);

        // Check preconditions
        for (const callback of action.command.callbacks) {
          if (callback.type === 'require') {
            if (!callback.check(resolvedState, resolvedInput)) {
              interleavingValid = false;
              break;
            }
          }
        }

        if (!interleavingValid) break;

        // Use the actual result from parallel execution
        const actualResult = resultMapping.get(action.output);
        if (actualResult === undefined) {
          interleavingValid = false;
          break;
        }

        environment.bind(action.output, actualResult);

        const stateBefore = currentState;

        // Apply updates
        for (const callback of action.command.callbacks) {
          if (callback.type === 'update') {
            currentState = callback.update(currentState, action.input, action.output);
          }
        }

        // Check postconditions
        const resolvedStateBefore = resolveState(stateBefore, environment);
        const resolvedStateAfter = resolveState(currentState, environment);

        for (const callback of action.command.callbacks) {
          if (callback.type === 'ensure') {
            if (!callback.check(resolvedStateBefore, resolvedStateAfter, resolvedInput, actualResult)) {
              interleavingValid = false;
              break;
            }
          }
        }

        if (!interleavingValid) break;

      } catch (_error) {
        interleavingValid = false;
        break;
      }
    }

    if (interleavingValid) {
      return { success: true };
    }
  }

  return {
    success: false,
    error: 'No valid interleaving found - linearization failed'
  };
}

// Execute parallel state machine testing
export async function executeParallel<State>(
  parallel: Parallel<State>
): Promise<{ success: boolean; failureDetails?: string }> {
  const environment = new Environment();
  let currentState = parallel.initialState;

  // Execute prefix sequentially
  for (let i = 0; i < parallel.prefix.length; i++) {
    const action = parallel.prefix[i];

    try {
      const resolvedInput = resolveInput(action.input, environment);
      const resolvedState = resolveState(currentState, environment);

      // Check preconditions
      for (const callback of action.command.callbacks) {
        if (callback.type === 'require') {
          if (!callback.check(resolvedState, resolvedInput)) {
            return {
              success: false,
              failureDetails: `Prefix precondition failed at action ${i}`,
            };
          }
        }
      }

      // Execute command
      const result = await action.command.executor(resolvedInput);
      environment.bind(action.output, result);

      const stateBefore = currentState;

      // Apply updates
      for (const callback of action.command.callbacks) {
        if (callback.type === 'update') {
          currentState = callback.update(currentState, action.input, action.output);
        }
      }

      // Check postconditions
      const resolvedStateBefore = resolveState(stateBefore, environment);
      const resolvedStateAfter = resolveState(currentState, environment);

      for (const callback of action.command.callbacks) {
        if (callback.type === 'ensure') {
          if (!callback.check(resolvedStateBefore, resolvedStateAfter, resolvedInput, result)) {
            return {
              success: false,
              failureDetails: `Prefix postcondition failed at action ${i}`,
            };
          }
        }
      }
    } catch (error) {
      return {
        success: false,
        failureDetails: `Prefix action ${i} threw error: ${error}`,
      };
    }
  }

  // Execute branches in parallel
  const [branch1, branch2] = parallel.branches;

  const executeBranch = async (
    branch: Action<State, unknown, unknown>[]
  ): Promise<ActionExecution<State>[]> => {
    const branchEnvironment = environment.clone();
    const executions: ActionExecution<State>[] = [];

    for (const action of branch) {
      try {
        const resolvedInput = resolveInput(action.input, branchEnvironment);
        const result = await action.command.executor(resolvedInput);
        branchEnvironment.bind(action.output, result);

        executions.push({
          action,
          result,
          success: true,
        });
      } catch (error) {
        executions.push({
          action,
          result: undefined,
          success: false,
          error: String(error),
        });
        break; // Stop on first error in branch
      }
    }

    return executions;
  };

  // Execute both branches concurrently
  const [branch1Executions, branch2Executions] = await Promise.all([
    executeBranch(branch1),
    executeBranch(branch2),
  ]);

  // Check if any branch failed
  const branch1Failed = branch1Executions.some(exec => !exec.success);
  const branch2Failed = branch2Executions.some(exec => !exec.success);

  if (branch1Failed || branch2Failed) {
    const failedBranch = branch1Failed ? 'branch1' : 'branch2';
    const failedExecution = branch1Failed ?
      branch1Executions.find(exec => !exec.success) :
      branch2Executions.find(exec => !exec.success);

    return {
      success: false,
      failureDetails: `${failedBranch} failed: ${failedExecution?.error || 'unknown error'}`,
    };
  }

  // Perform linearization check
  const linearizationResult = await linearize(currentState, branch1Executions, branch2Executions);

  if (!linearizationResult.success) {
    return {
      success: false,
      failureDetails: linearizationResult.error || 'Linearization failed',
    };
  }

  return { success: true };
}

// Property-based test creation for parallel state machine testing
export class ParallelStateMachineProperty<State> {
  constructor(private readonly parallelGen: Gen<Parallel<State>>) {}

  async check(config?: { testLimit?: number; seed?: number }): Promise<{
    ok: boolean;
    counterexample?: Parallel<State>;
    error?: string;
  }> {
    const testLimit = config?.testLimit ?? 100;
    const seed = config?.seed ?? Math.floor(Math.random() * 2 ** 32);
    let currentSeed = Seed.fromNumber(seed);

    for (let i = 0; i < testLimit; i++) {
      const size = Size.of(Math.min(i, 100));
      const tree = this.parallelGen.generate(size, currentSeed);
      const parallelSequence = tree.value;

      try {
        const result = await executeParallel(parallelSequence);
        if (!result.success) {
          return {
            ok: false,
            counterexample: parallelSequence,
            error: result.failureDetails ?? 'Unknown failure',
          };
        }
      } catch (error) {
        return {
          ok: false,
          counterexample: parallelSequence,
          error: `Execution error: ${error}`,
        };
      }

      const [, newSeed] = currentSeed.split();
      currentSeed = newSeed;
    }

    return { ok: true };
  }
}

export function forAllParallel<State>(
  parallelGen: Gen<Parallel<State>>
): ParallelStateMachineProperty<State> {
  return new ParallelStateMachineProperty(parallelGen);
}
