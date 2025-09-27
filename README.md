# Hedgehog for TypeScript

A property-based testing library for TypeScript, inspired by the Haskell [Hedgehog](https://hedgehog.qa/) library. Hedgehog automatically generates test cases and provides integrated shrinking to find minimal failing examples.

## Key features

- **Property-based testing**: Define properties that should hold for all inputs, and Hedgehog generates test cases automatically
- **Integrated shrinking**: When tests fail, Hedgehog automatically finds the smallest input that reproduces the failure  
- **High-performance random generation**: Adaptive seed implementation automatically optimizes between WASM and JavaScript based on workload
- **Transparent batch optimization**: Bulk operations automatically use optimized batching for 18-128x performance improvements
- **Splittable random generation**: Uses SplitMix64 for independent, reproducible random streams
- **Type-safe generators**: Compositional generators with full TypeScript type safety

## Performance-optimized architecture

This library features a unique **AdaptiveSeed** implementation that is **used by default** and transparently chooses the optimal random number generation strategy:

- **WASM implementation**: Rust-compiled WebAssembly for maximum computational speed (2.89x faster construction, 1.92x faster boolean generation)
- **BigInt implementation**: Pure TypeScript for complex workflows (2.70x faster for chained operations)
- **Automatic batching**: Bulk operations automatically use WASM batching when beneficial (18-128x speedup for large operations)
- **Silent fallback**: Gracefully falls back to BigInt if WASM is unavailable

**The default `Seed` export is AdaptiveSeed** - it automatically selects the best approach based on operation patterns, providing optimal performance without user intervention.

## Installation

```bash
npm install hedgehog
```

## Quick start

```typescript
import { forAll, Gen, int, string } from 'hedgehog';

// Define a property: reversing a list twice gives the original list
const reverseTwiceProperty = forAll(
  Gen.array(int(1, 100)),
  (list) => {
    const reversed = list.reverse().reverse();
    return JSON.stringify(reversed) === JSON.stringify(list);
  }
);

// Test with complex data structures  
const userProperty = forAll(
  Gen.object({
    id: int(1, 1000),
    name: Gen.optional(string()),           // string | undefined
    email: Gen.nullable(string()),          // string | null
    status: Gen.union(                      // 'active' | 'inactive' | 'pending'
      Gen.constant('active'),
      Gen.constant('inactive'), 
      Gen.constant('pending')
    )
  }),
  (user) => {
    // Property: user objects have valid structure
    return typeof user.id === 'number' && 
           user.id > 0 && 
           ['active', 'inactive', 'pending'].includes(user.status);
  }
);

// Test the properties
console.log('Reverse property:', reverseTwiceProperty.check().ok);
console.log('User property:', userProperty.check().ok);
```

## Core concepts

### Properties

Properties are statements that should be true for all valid inputs:

```typescript
import { forAll, Gen, int, string } from 'hedgehog';

// Property: string length is preserved under concatenation
const concatenationProperty = forAll(
  Gen.tuple(string(), string()),
  ([a, b]) => {
    const result = a + b;
    return result.length === a.length + b.length;
  }
);

// Property: addition is commutative
const commutativeProperty = forAll(
  Gen.tuple(int(0, 1000), int(0, 1000)),
  ([a, b]) => a + b === b + a
);
```

### Generators

Generators produce random test data of specific types:

```typescript
import { Gen } from 'hedgehog';

// Basic generators
const boolGen = Gen.bool();
const numberGen = Gen.int(1, 100);
const stringGen = Gen.string();

// Composite generators
const arrayGen = Gen.array(numberGen);
const objectGen = Gen.object({
  id: numberGen,
  name: stringGen,
  active: boolGen
});

// Transformed generators
const evenNumberGen = numberGen
  .filter(n => n % 2 === 0)
  .map(n => n * 2);
```

### Union and optional types

Handle nullable, optional, and union types elegantly:

```typescript
// Optional and nullable generators
const optionalName = Gen.optional(stringGen);        // string | undefined
const nullableId = Gen.nullable(numberGen);          // number | null

// Union types
const statusGen = Gen.union(
  Gen.constant('pending'),
  Gen.constant('success'), 
  Gen.constant('error')
);  // 'pending' | 'success' | 'error'

// Discriminated unions for complex types
interface SuccessResult {
  type: 'success';
  data: string;
}

interface ErrorResult {
  type: 'error';
  message: string;
}

const resultGen = Gen.discriminatedUnion('type', {
  success: Gen.object({
    type: Gen.constant('success' as const),
    data: stringGen
  }),
  error: Gen.object({
    type: Gen.constant('error' as const), 
    message: stringGen
  })
});  // SuccessResult | ErrorResult

// Weighted unions for probability control
const biasedBoolGen = Gen.weightedUnion([
  [9, Gen.constant(true)],   // 90% true
  [1, Gen.constant(false)]   // 10% false
]);
```

### Seeds and reproducibility

The `Seed` class provides deterministic random generation. **By default, this is the AdaptiveSeed implementation** which automatically optimizes performance:

```typescript
import { Seed, Gen, Size } from 'hedgehog';

// This is AdaptiveSeed - automatically optimized
const seed = Seed.fromNumber(42);
const size = Size.of(10);
const gen = Gen.int(1, 100);

// Generate the same value every time with the same seed
const tree1 = gen.generate(size, seed);
const tree2 = gen.generate(size, seed);
console.log(tree1.value === tree2.value); // true

// Split seeds for independent generation
const [leftSeed, rightSeed] = seed.split();
const leftValue = gen.generate(size, leftSeed).value;
const rightValue = gen.generate(size, rightSeed).value;
// leftValue and rightValue are independent

// Check what implementation is being used
console.log(seed.getImplementation()); // 'wasm' | 'bigint' | 'bigint-fallback'
```

## Performance optimization

### Automatic performance selection

The default `Seed` automatically chooses the optimal implementation:

```typescript
import { Seed } from 'hedgehog';

const seed = Seed.fromNumber(42);

// Single operations: automatically uses WASM for speed
const [bool, newSeed] = seed.nextBool();  // 1.92x faster with WASM

// Bulk operations: automatically batches with WASM
const result = seed.nextBools(1000);      // 18.37x faster with batching

// Complex workflows: automatically uses BigInt for efficiency
// (Multiple chained operations favor BigInt due to lower overhead)
```

### Performance introspection

Check which implementation is being used:

```typescript
console.log(seed.getImplementation()); // 'wasm', 'bigint', or 'bigint-fallback'

const perfInfo = seed.getPerformanceInfo();
console.log(perfInfo.batchingAvailable);      // true if WASM batching available
console.log(perfInfo.recommendedForBulkOps);  // true if optimal for bulk operations
```

### Explicit implementation selection

For advanced use cases, you can choose specific implementations:

```typescript
import { Seed as BigIntSeed } from 'hedgehog/seed/bigint';
import { Seed as WasmSeed } from 'hedgehog/seed/wasm';
import { AdaptiveSeed } from 'hedgehog/seed/adaptive';

// Explicit BigInt usage (pure JavaScript, works everywhere)
const bigintSeed = BigIntSeed.fromNumber(42);
const [bool1, newSeed1] = bigintSeed.nextBool();   // Individual operations

// Explicit WASM usage (fastest for computational workloads)
const wasmSeed = WasmSeed.fromNumber(42);
const [bool2, newSeed2] = wasmSeed.nextBool();     // Individual: 1.92x faster
const bulkBools = wasmSeed.nextBools(1000);        // Batched: 18.37x faster

// Force BigInt even in AdaptiveSeed
const forcedBigInt = AdaptiveSeed.fromNumberBigInt(42);
```

All implementations support both individual operations and bulk operations, with WASM providing significant performance advantages for both single calls and batched operations.

## What AdaptiveSeed does automatically

**AdaptiveSeed is the default `Seed` implementation** that provides transparent optimization:

### Automatic Implementation Selection
- **Tries WASM first** for computational advantages (2.89x faster construction, 1.92x faster booleans)
- **Silent fallback to BigInt** if WASM is unavailable (ensures your code always works)
- **Never fails** due to environment issues - always provides a working implementation

### Automatic Batching
- **Individual calls** for operations ≤ 10 (uses fastest available implementation)
- **WASM batching** for operations > 10 when available (18-128x speedup)
- **Intelligent thresholds** based on comprehensive benchmarking data

### When to Use Each Implementation

**Use the default (AdaptiveSeed)** - Recommended for 99% of use cases:
```typescript
import { Seed } from 'hedgehog';  // This is AdaptiveSeed
const seed = Seed.fromNumber(42); // Automatically optimized
```

**Use explicit BigInt** when you need:
- Pure JavaScript (no WASM dependencies)
- Complex chained operations (2.70x faster for workflows)
- Guaranteed memory efficiency
```typescript
import { Seed as BigIntSeed } from 'hedgehog/seed/bigint';
const seed = BigIntSeed.fromNumber(42); // Pure JavaScript
```

**Use explicit WASM** when you need:
- Maximum computational performance
- Bulk operations with guaranteed batching
- Known WASM-available environment
```typescript
import { Seed as WasmSeed } from 'hedgehog/seed/wasm';
const seed = WasmSeed.fromNumber(42); // Pure WASM, no fallback
```

## Advanced usage

### Custom generators

Create domain-specific generators:

```typescript
// Email generator
const emailGen = Gen.tuple(
  Gen.stringOfLength(Gen.int(3, 10)),
  Gen.constant('@'),
  Gen.stringOfLength(Gen.int(3, 8)),
  Gen.constant('.com')
).map(([name, at, domain, tld]) => name + at + domain + tld);

// Tree structure generator
interface TreeNode {
  value: number;
  children: TreeNode[];
}

const treeGen: Gen<TreeNode> = Gen.sized(size => {
  if (size.value <= 1) {
    return Gen.object({
      value: Gen.int(1, 100),
      children: Gen.constant([])
    });
  }
  
  return Gen.object({
    value: Gen.int(1, 100),
    children: Gen.array(treeGen.scale(s => s.scale(0.5)))
  });
});
```

### Bulk operations

For performance-critical bulk generation:

```typescript
const seed = Seed.fromNumber(42);

// Generate many booleans efficiently (uses automatic batching)
const boolResult = seed.nextBools(10000);    // 18-128x faster than individual calls
console.log(boolResult.values.length);       // 10000
console.log(boolResult.finalSeed);           // Updated seed for further generation

// Generate many bounded values
const boundedResult = seed.nextBoundedBulk(5000, 100);
console.log(boundedResult.values.every(v => v >= 0 && v < 100)); // true
```

### Configuration and debugging

Configure test execution:

```typescript
import { Config } from 'hedgehog';

const config = Config.default()
  .withTestLimit(1000)        // Run 1000 test cases
  .withShrinkLimit(100)       // Try up to 100 shrinking attempts
  .withSeed(42);              // Use specific seed for reproducibility

const result = property.check(config);
```

## Performance characteristics

Based on comprehensive benchmarking on Apple M3 Pro:

### WASM advantages
- **Construction**: 2.89x faster than BigInt  
- **Boolean generation**: 1.92x faster than BigInt
- **Single operations**: Optimal for isolated calls

### BigInt advantages  
- **Complex workflows**: 2.70x faster than WASM
- **Memory efficiency**: 3x less allocation pressure
- **Chained operations**: Lower object creation overhead

### Batch operations
- **Small batches (≤10)**: Uses individual calls
- **Large batches (>10)**: Automatic WASM batching
- **Optimal batch size**: 1000 operations (18.37x speedup)
- **Maximum observed speedup**: 128.62x for very large batches

The AdaptiveSeed automatically switches between implementations based on these characteristics, ensuring optimal performance for any workload.

## Build requirements

If using WASM features and building from source:

- **Rust**: 1.88.0 or newer
- **wasm-pack**: 0.13.1 or newer
- **Node.js**: 18.0.0 or newer

Build WASM module:
```bash
npm run build:wasm
```

The library gracefully falls back to pure JavaScript if WASM is unavailable.

## Testing and development

Run the test suite:
```bash
npm test                    # Run tests (fast)
npm run test:watch         # Watch mode
```

Performance analysis:
```bash
npm run bench              # Run performance benchmarks
```

Type checking and linting:
```bash  
npm run typecheck          # Type check
npm run lint               # Lint code
npm run lint:fix           # Fix lint issues
```

## Contributing

Contributions welcome! This library follows these principles:

- **Performance**: Automatic optimization without user complexity
- **Type safety**: Full TypeScript support with precise types  
- **Composability**: Generators should compose naturally
- **Determinism**: Reproducible test runs with seed control
- **Simplicity**: Clear, obvious APIs that just work

## State machine testing

TypeScript Hedgehog now includes comprehensive state machine testing capabilities, allowing you to test stateful systems with realistic command sequences:

```typescript
import {
  command, require, update, ensure,
  sequential, forAllSequential, commandRange,
  newVar, Gen, Range
} from 'hedgehog';

// Define your system's state
interface BankState {
  accounts: Map<Variable<string>, { balance: number; isOpen: boolean }>;
}

// Create commands that model operations
const createAccount = command(
  (_state) => Gen.object({ initialBalance: Gen.int(Range.uniform(0, 1000)) }),
  async (input) => `account_${Math.random().toString(36).slice(2)}`,
  require((_state, input) => input.initialBalance >= 0),
  update((state, input, output) => ({
    accounts: new Map(state.accounts).set(output, {
      balance: input.initialBalance,
      isOpen: true
    })
  })),
  ensure((_before, after, _input, _output) => after.accounts.size > 0)
);

// Test realistic sequences of operations
const property = forAllSequential(
  sequential(
    commandRange(5, 15),
    { accounts: new Map() },
    [createAccount, deposit, withdraw, closeAccount]
  )
);

await property.check({ testLimit: 100 });
```

State machine testing provides:
- **Symbolic variables**: Commands can reference outputs from previous commands
- **Realistic sequences**: Generate command sequences that respect state dependencies
- **Comprehensive validation**: Check preconditions, state transitions, and postconditions
- **Automatic shrinking**: Failed sequences shrink to minimal counterexamples

See the [State Machine Testing Guide](docs/state-machine-testing.md) for complete documentation.

## Roadmap

### Completed features ✅

- **Core property-based testing**: Generators, properties, shrinking
- **High-performance random generation**: AdaptiveSeed with WASM optimization
- **Type-safe generators**: Full TypeScript support with precise types
- **State machine testing**: Sequential command execution with symbolic variables
- **Comprehensive documentation**: User guides and implementation details

### Advanced features (planned) 🚧

- **Parallel command execution**: Test concurrent operations with race condition detection
- **Enhanced shrinking**: Smarter shrinking strategies for command sequences
- **Custom test runners**: Integration with popular testing frameworks
- **Coverage-guided testing**: Generate test cases based on code coverage
- **Mutation testing**: Automatically introduce bugs to verify test quality

## License

BSD-3-Clause

## Further reading

- [State Machine Testing Guide](docs/state-machine-testing.md) - Complete user documentation
- [State Machine Implementation](docs/state-machine-implementation.md) - Technical architecture details
- [Performance Analysis](docs/performance-analysis.md) - Detailed benchmarking results
- [WASM Bindings](docs/wasm-bindings.md) - Technical details of WASM integration
- [Hedgehog (Haskell)](https://hedgehog.qa/) - Original inspiration
- [Property-based testing](https://en.wikipedia.org/wiki/Property-based_testing) - Background concepts