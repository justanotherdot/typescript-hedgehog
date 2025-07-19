# WASM bindings and language integration

## Overview

The Hedgehog SplitMix64 WASM module is designed to be language-agnostic. The core WebAssembly module exports a clean, minimal API that can be consumed from any language supporting WASM.

## Current bindings

### TypeScript/JavaScript

Located at `src/seed/wasm.ts`. Provides:
- Type-safe wrapper around WASM module
- Fallback to BigInt implementation
- Consistent API with other Seed implementations

## FUTURE: Automated binding generation

### Approach 1: Manual bindings per language

Each language maintainer creates bindings following the pattern:

```
bindings/
├── typescript/     # Current implementation
├── python/         # pip install hedgehog-splitmix-wasm
├── go/             # go get hedgehog-splitmix-wasm
├── rust/           # cargo add hedgehog-splitmix-wasm
└── java/           # Maven/Gradle artifacts
```

**Pros:**
- Language-idiomatic APIs
- Manual optimization possible
- Community driven

**Cons:**
- Maintenance burden
- API drift between languages
- Duplication of effort

### Approach 2: IDL-based generation

Define the API in an Interface Definition Language (IDL) like:

#### Option A: WebIDL
```webidl
interface Seed {
  constructor(unsigned long long value);
  static Seed fromParts(unsigned long long state, unsigned long long gamma);
  readonly attribute unsigned long long state;
  readonly attribute unsigned long long gamma;
  SeedAndValue nextU64();
  SeedAndValue nextBounded(unsigned long long bound);
  SeedAndBool nextBool();
  SeedPair split();
};
```

#### Option B: Custom IDL (Smithy-style)
```smithy
namespace hedgehog.splitmix

structure Seed {
    @required
    state: Long,
    @required  
    gamma: Long
}

service SplitMix {
    operations: [CreateSeed, NextU64, NextBounded, NextBool, Split]
}

operation CreateSeed {
    input: CreateSeedInput,
    output: Seed
}

structure CreateSeedInput {
    @required
    value: Long
}
```

#### Option C: Protocol Buffers + gRPC
```proto
service SplitMix64 {
  rpc CreateSeed(CreateSeedRequest) returns (Seed);
  rpc NextU64(Seed) returns (NextU64Response);
  rpc NextBounded(NextBoundedRequest) returns (NextU64Response);
  rpc NextBool(Seed) returns (NextBoolResponse);
  rpc Split(Seed) returns (SplitResponse);
}

message Seed {
  uint64 state = 1;
  uint64 gamma = 2;
}
```

### Code generation tool

A tool that reads the IDL and generates:
- Language-specific bindings
- Type definitions
- Documentation
- Test stubs

```bash
# Generate bindings for all languages
hedgehog-bindgen --idl api.smithy --output bindings/

# Generate for specific language
hedgehog-bindgen --idl api.smithy --lang python --output bindings/python/
```

## Recommendation

For **now**: Manual TypeScript bindings (current approach)

For **future**: Consider IDL-based generation when we have:
1. Multiple language requests
2. Stable API (no breaking changes)
3. Community bandwidth for tooling

The WASM module API is intentionally minimal to make manual bindings manageable. Most languages can create bindings in ~100 lines of code following the TypeScript pattern.

## Language-specific considerations

### Python
- Use `wasmtime-py` or `wasmer-python`
- Package as `hedgehog-splitmix-wasm` on PyPI
- Follow NumPy random API patterns

### Go  
- Use `wasmtime-go` or embed WASM in binary
- Follow `math/rand` interface patterns
- Module: `github.com/hedgehog/splitmix-wasm`

### Rust
- Use `wasmtime` or compile to native library  
- Crate: `hedgehog-splitmix-wasm`
- Follow `rand` crate patterns

### Java
- Use `wasmtime-java` or GraalVM
- Maven Central artifact
- Follow `java.util.Random` patterns

### C/C++
- Use WASI runtime
- Header files with proper linkage
- Follow standard C library patterns

## Testing cross-language compatibility

All bindings should produce identical output for same seeds:

```bash
# Reference test vectors
seed=42, bound=100 → value=73
seed=42, split → left_state=1234, right_state=5678
```

Automated testing can verify all language bindings produce these exact values.