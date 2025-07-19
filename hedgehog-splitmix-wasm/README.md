# Hedgehog SplitMix64 WASM

High-performance WebAssembly implementation of the SplitMix64 splittable pseudorandom number generator.

## Overview

This is a language-agnostic WebAssembly module that provides:

- **SplitMix64 algorithm**: High-quality 64-bit pseudorandom number generation
- **Splittable streams**: Create independent random number generators
- **Deterministic**: Same seed always produces same sequence
- **High performance**: ~6x faster than pure JavaScript implementations

## Building

Requires [wasm-pack](https://rustwasm.github.io/wasm-pack/):

```bash
# From project root
bin/build-wasm

# Or manually
cd hedgehog-splitmix-wasm
wasm-pack build --target web --out-dir pkg
```

## Usage

### From TypeScript/JavaScript

```typescript
import { Seed } from './hedgehog-splitmix-wasm/pkg';

// Create seed from number
const seed = new Seed(42);

// Generate random values
const { value, seed: nextSeed } = seed.next_u64();
const { value: bounded, seed: nextSeed2 } = seed.next_bounded(100);
const { value: boolean, seed: nextSeed3 } = seed.next_bool();

// Split into independent streams
const { left, right } = seed.split();
```

### From other languages

The WASM module can be imported and used from any language that supports WebAssembly:

- Python (with `wasmtime-py` or similar)
- Go (with `wasmtime-go`)
- Rust (with `wasmtime`)
- C/C++ (with WASI)
- And many others

## API

### Seed

- `new Seed(value: u64)` - Create seed from number
- `Seed.from_parts(state: u64, gamma: u64)` - Create from components
- `seed.state` - Get state component
- `seed.gamma` - Get gamma component
- `seed.next_u64()` - Generate next u64 and new seed
- `seed.next_bounded(bound: u64)` - Generate bounded value [0, bound)
- `seed.next_bool()` - Generate boolean
- `seed.split()` - Split into two independent seeds

## Algorithm Details

Based on the SplitMix64 algorithm with these key properties:

- **Period**: 2^64 for each generator stream
- **Quality**: Passes statistical randomness tests
- **Splitting**: Creates mathematically independent streams
- **Performance**: Optimized for speed and small WASM binary size

### Constants

- Golden ratio: `0x9e3779b97f4a7c15`
- Mix multipliers: `0xbf58476d1ce4e5b9`, `0x94d049bb133111eb`

## License

BSD-3-Clause (same as parent project)