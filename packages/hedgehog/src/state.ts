import { Gen } from './gen.js';
import { Size, Range } from './data/size.js';
import { Tree } from './data/tree.js';
import { Seed } from './data/seed.js';

// Type helpers for type-safe state machine commands

/**
 * Recursively resolves Variable<T> types to their concrete values T.
 *
 * State machine commands use symbolic Variables during generation and concrete values
 * during execution. This type transformation reflects that executors receive resolved
 * values, not symbolic Variables.
 *
 * Symbolic vs Resolved contexts:
 * - Generator: Returns Input with Variable<T> (symbolic)
 * - Require: Receives Input with Variable<T> (symbolic)
 * - Update: Receives Input with Variable<T>, output Variable<Output> (symbolic)
 * - Executor: Receives ResolvedInput<Input> where Variable<T> → T (resolved)
 * - Ensure: Receives ResolvedInput<Input> and Output (resolved)
 *
 * @example
 * type Input = { teamId: Variable<string>; count: number };
 * type Resolved = ResolvedInput<Input>;
 * // Resolved = { teamId: string; count: number }
 *
 * const cmd = command<State, Input, string>(
 *   (state) => Gen.object({
 *     teamId: Gen.item(teamIds), // Returns Variable<string>
 *     count: Gen.int(Range.uniform(0, 10))
 *   }),
 *   async (input) => {
 *     input.teamId // Type: string (resolved, not Variable<string>)
 *     input.count  // Type: number (unchanged)
 *     return engine.process({ teamId: input.teamId }); // No cast needed
 *   },
 *   // ...callbacks
 * );
 */
type ResolvedInput<T> = {
  [K in keyof T]: T[K] extends Variable<infer U>
    ? U
    : T[K] extends object
    ? ResolvedInput<T[K]>
    : T[K];
};

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

  equals(other: Symbolic<_T>): boolean {
    return this.id === other.id;
  }
}

export class Concrete<T> {
  readonly type = 'concrete' as const;

  constructor(readonly value: T) {}

  // Structural equality - compares wrapped values
  equals(other: Concrete<T>): boolean {
    if (this === other) return true;

    // Deep equality for objects/arrays
    if (typeof this.value === 'object' && typeof other.value === 'object') {
      return JSON.stringify(this.value) === JSON.stringify(other.value);
    }

    return this.value === other.value;
  }
}

export type Variable<T> = Symbolic<T> | Concrete<T>;

// Environment maps symbolic variables to concrete wrappers
export class Environment {
  private readonly bindings = new Map<number, Concrete<unknown>>();
  private readonly concreteCache: Map<any, Concrete<any>>;

  constructor(sharedCache?: Map<any, Concrete<any>>) {
    this.concreteCache = sharedCache ?? new Map();
  }

  bind<T>(symbolic: Symbolic<T>, concrete: Concrete<T>): void {
    this.bindings.set(symbolic.id, concrete);
  }

  lookup<T>(symbolic: Symbolic<T>): Concrete<T> | undefined {
    return this.bindings.get(symbolic.id) as Concrete<T> | undefined;
  }

  // Interning: same value → same Concrete instance
  // Enables value-based equality via reference equality for Map keys
  // Critical for Map<Variable, Data> to match SUT behavior with duplicate values
  createConcrete<T>(value: T): Concrete<T> {
    const cacheKey = typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : value;

    if (this.concreteCache.has(cacheKey)) {
      return this.concreteCache.get(cacheKey)!;
    }

    const concrete = new Concrete(value);
    this.concreteCache.set(cacheKey, concrete);
    return concrete;
  }

  has(symbolic: Symbolic<unknown>): boolean {
    return this.bindings.has(symbolic.id);
  }

  reify<T>(variable: Variable<T>): T | undefined {
    if (variable.type === 'concrete') {
      return variable.value;
    }
    const concrete = this.lookup(variable);
    return concrete?.value;
  }

  // Clone with shared interning cache
  // Each branch needs independent bindings (different Symbolic → Concrete mappings)
  // But shared cache ensures duplicate values return same Concrete across branches
  clone(): Environment {
    const env = new Environment(this.concreteCache); // Share the cache
    env.bindings.clear();
    for (const [id, value] of this.bindings) {
      env.bindings.set(id, value);
    }
    return env;
  }
}

// Helper to check if a value is a Variable
function isVariable(value: any): value is Variable<any> {
  return value != null &&
         typeof value === 'object' &&
         ('type' in value) &&
         (value.type === 'symbolic' || value.type === 'concrete');
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
// Executor receives ResolvedInput where Variables are replaced with concrete values
export interface Command<State, Input, Output> {
  generator: (state: State) => Gen<Input> | null;
  executor: (input: ResolvedInput<Input>) => Promise<Output> | Output;
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

// Fully unwrap Variables to plain values
// Used by: executors (don't know about Variables), ensure (compares plain values)
// Symbolic → lookup → unwrap to value
// Concrete → unwrap to value
function resolveInput(input: any, environment: Environment): any {
  if (input && typeof input === 'object') {
    if (input.type === 'symbolic') {
      const resolved = environment.lookup(input);
      if (resolved === undefined) {
        throw new Error(`Unresolved symbolic variable: ${input.toString()}`);
      }
      return resolved.value; // Unwrap the Concrete wrapper
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

// Replace Symbolic with Concrete wrappers, preserving Variable structure
// Used by: require (needs Variables for checking but not plain Symbolic)
// Symbolic → lookup → Concrete wrapper (keeps as Variable for Map keys)
// Concrete → unchanged
function concretizeInput<I>(input: I, environment: Environment): I {
  function concretize(value: any): any {
    if (isVariable(value)) {
      if (value.type === 'symbolic') {
        const concrete = environment.lookup(value);
        if (concrete === undefined) {
          throw new Error(`Unresolved symbolic variable: ${value.toString()}`);
        }
        return concrete;
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(concretize);
    }

    if (value !== null && typeof value === 'object') {
      const result: any = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = concretize(val);
      }
      return result;
    }

    return value;
  }

  return concretize(input);
}

// Helper to serialize state for error messages (handles Maps properly)
function serializeForErrorMessage(obj: any, _indent = 0): string {
  if (obj === null || obj === undefined) return String(obj);
  if (typeof obj !== 'object') return JSON.stringify(obj);

  if (obj instanceof Map) {
    const entries = Array.from(obj.entries())
      .map(([k, v]) => `${JSON.stringify(k)}: ${serializeForErrorMessage(v)}`)
      .join(', ');
    return `Map(${obj.size}) {${entries}}`;
  }

  if (Array.isArray(obj)) {
    return `[${obj.map(v => serializeForErrorMessage(v)).join(', ')}]`;
  }

  const props = Object.entries(obj)
    .map(([k, v]) => `${k}: ${serializeForErrorMessage(v)}`)
    .join(', ');
  return `{${props}}`;
}

// Recursively resolve Variables in state to plain values
// Used by: ensure callbacks (need plain values for comparison)
// Handles Maps specially: resolves both keys and values
// Invariant: Map<Variable<K>, V> → Map<K, V> (same semantics as SUT)
function resolveState(state: any, environment: Environment): any {
  if (state && typeof state === 'object') {
    if (state instanceof Map) {
      const resolved = new Map();
      for (const [key, value] of state.entries()) {
        const resolvedKey = resolveInput(key, environment);
        const resolvedValue = resolveInput(value, environment);

        // Warn if we're about to overwrite a key (collision detection)
        if (resolved.has(resolvedKey)) {
          console.warn(
            `WARNING: Map key collision detected!\n` +
            `  Symbolic key ${key} resolves to ${JSON.stringify(resolvedKey)}\n` +
            `  This will overwrite existing entry with same key.\n` +
            `  This usually means your executor is returning duplicate IDs.`
          );
        }

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

// Execute actions sequentially against real system
// Flow: require → executor → update → ensure
// Key invariant: update receives Symbolic variables (for Map keys),
//                ensure receives unwrapped values (for comparison)
export async function executeSequential<State>(
  sequence: Sequential<State>
): Promise<{ success: boolean; failureDetails?: string }> {
  const environment = new Environment();
  let currentState = sequence.initialState;

  for (let i = 0; i < sequence.actions.length; i++) {
    const action = sequence.actions[i];

    try {
      const concretizedInput = concretizeInput(action.input, environment);
      const resolvedInput = resolveInput(action.input, environment);

      // Check preconditions
      for (const callback of action.command.callbacks) {
        if (callback.type === 'require') {
          if (!callback.check(currentState, concretizedInput)) {
            const resolvedState = resolveState(currentState, environment);
            return {
              success: false,
              failureDetails: `Precondition failed at action ${i}
Input: ${serializeForErrorMessage(resolvedInput)}
State: ${serializeForErrorMessage(resolvedState)}
(Executor was not called - precondition prevents side effects)`,
            };
          }
        }
      }

      const result = await action.command.executor(resolvedInput);

      // Intern result: same value → same Concrete instance (critical for Map keys)
      const concreteOutput = environment.createConcrete(result);
      environment.bind(action.output, concreteOutput);

      const stateBefore = currentState;

      // Update model state with Symbolic variables
      // Using action.input/action.output (not resolved) preserves Variables for Map keys
      for (const callback of action.command.callbacks) {
        if (callback.type === 'update') {
          currentState = callback.update(
            currentState,
            action.input,
            action.output
          );
        }
      }

      // Resolve state for ensure callbacks (Variables → plain values)
      const resolvedStateBefore = resolveState(stateBefore, environment);
      const resolvedStateAfter = resolveState(currentState, environment);

      // Check postconditions with unwrapped values
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
              failureDetails: `Postcondition failed at action ${i}
Input: ${serializeForErrorMessage(resolvedInput)}
Output: ${serializeForErrorMessage(result)}
State before: ${serializeForErrorMessage(resolvedStateBefore)}
State after: ${serializeForErrorMessage(resolvedStateAfter)}`,
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
// Executor receives resolved input (Variables replaced with concrete values)
export function command<State, Input, Output>(
  generator: (state: State) => Gen<Input> | null,
  executor: (input: ResolvedInput<Input>) => Promise<Output> | Output,
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

// Generate all possible interleavings of two sequences
// Maintains relative order within each sequence (not permutations!)
// Example: interleave([A,B], [X,Y]) produces:
//   [A,B,X,Y], [A,X,B,Y], [A,X,Y,B], [X,A,B,Y], [X,A,Y,B], [X,Y,A,B]
// Used for linearizability: at least one interleaving must satisfy all conditions
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
  readonly result: Concrete<unknown> | undefined;
  readonly success: boolean;
  readonly error?: string;
}


// Check linearizability: can concurrent execution be explained by some sequential order?
// Try all interleavings of branch actions; if any satisfies pre/postconditions, test passes
// Uses actual results from parallel execution (not re-executing)
async function linearize<State>(
  initialState: State,
  branch1Executions: ActionExecution<State>[],
  branch2Executions: ActionExecution<State>[]
): Promise<{ success: boolean; error?: string }> {
  // Extract actions from executions
  const branch1Actions = branch1Executions.map(exec => exec.action);
  const branch2Actions = branch2Executions.map(exec => exec.action);

  // Create a mapping of action outputs to their actual results
  const resultMapping = new Map<Symbolic<unknown>, Concrete<unknown>>();
  for (const exec of branch1Executions) {
    if (exec.success && exec.result) {
      resultMapping.set(exec.action.output, exec.result);
    }
  }
  for (const exec of branch2Executions) {
    if (exec.success && exec.result) {
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
            const actualValue = actualResult?.type === 'concrete' ? actualResult.value : actualResult;
            if (!callback.check(resolvedStateBefore, resolvedStateAfter, resolvedInput, actualValue)) {
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
      const concreteOutput = environment.createConcrete(result);
      environment.bind(action.output, concreteOutput);

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
        const concreteOutput = branchEnvironment.createConcrete(result);
        branchEnvironment.bind(action.output, concreteOutput);

        executions.push({
          action,
          result: concreteOutput,
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
