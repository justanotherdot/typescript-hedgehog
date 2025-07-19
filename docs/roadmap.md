# Hedgehog TypeScript port roadmap

## Overview

This document outlines the roadmap for porting Hedgehog property-based testing library to TypeScript. Hedgehog's key innovation is **integrated shrinking** where generators produce rose trees containing both values and their shrink alternatives.

## Core architecture

### Foundation concepts

1. **Explicit generators** - First-class generators composed with combinators
2. **Integrated shrinking** - Shrinking built into generators via rose trees
3. **Size-driven generation** - Complexity controlled by size parameter (0-100)
4. **Splittable random seeds** - Deterministic, reproducible testing

### Key data structures

```typescript
type Gen<T> = (size: Size, seed: Seed) => Tree<T>
type Tree<T> = { value: T; children: Tree<T>[] }
type Size = number // 0-100
type Seed = [number, number] // SplitMix64 state
```

## Implementation phases

### Phase 1: Core infrastructure ✅ **COMPLETED**

**DONE:**
- [x] Implement 64-bit SplitMix64 with BigInt for quality randomness
- [x] Create Size and Range types for size-driven generation  
- [x] Implement Tree structure for values with shrink alternatives
- [x] Create basic Gen type and core combinators
- [x] Set up ESM module enforcement and multiple entry points

**Key files:**
- `src/seed/bigint.ts` - 64-bit SplitMix64 implementation
- `src/data/size.ts` - Size and Range types
- `src/data/tree.ts` - Rose tree structure
- `src/gen.ts` - Core generator type and combinators

### Phase 2: Basic generators ✅ **COMPLETED**

**DONE:**
- [x] Primitive generators (int, bool, string with shrinking)
- [x] Range-based generators with proper shrinking towards origin
- [x] Choice combinators (oneOf, frequency) 
- [x] Mapping and filtering operations
- [x] Common generator presets (Ints, Strings)

**Key files:**
- `src/gen/primitive.ts` - Basic value generators with shrinking

### Phase 3: Collection generators

**TODO:**
- [ ] Array generators with size control
- [ ] Object generators with property selection
- [ ] Recursive generators for nested structures
- [ ] Tuple generators

**Key files:**
- `src/gen/collection.ts` - Array and object generators
- `src/gen/recursive.ts` - Recursive structure support

### Phase 4: Property testing core

**TODO:**
- [ ] Property definition and execution
- [ ] Test configuration (test count, shrink limit, size)
- [ ] Shrinking algorithm implementation
- [ ] Result types and reporting

**Key files:**
- `src/property.ts` - Property definition
- `src/config.ts` - Test configuration
- `src/shrink.ts` - Shrinking algorithm
- `src/result.ts` - Test result types

### Phase 5: Advanced features

**TODO:**
- [ ] Statistics collection and classification
- [ ] Async property testing
- [ ] State machine testing
- [ ] Regression testing (replay specific cases)

**Key files:**
- `src/stats.ts` - Statistics and classification
- `src/async.ts` - Promise-based testing
- `src/state.ts` - State machine testing

### Phase 6: Ecosystem integration

**TODO:**
- [ ] Jest integration and custom matchers
- [ ] Vitest integration
- [ ] Node.js test runner integration
- [ ] Documentation and examples

**Key files:**
- `src/integration/jest.ts` - Jest integration
- `src/integration/vitest.ts` - Vitest integration
- `examples/` - Usage examples

## Design decisions

### TypeScript-specific adaptations

1. **Eager shrinking** - Pre-compute shrink trees for performance
2. **Type-safe generators** - Leverage TypeScript's type system
3. **Modern JavaScript** - Use iterators, async/await, and ES modules
4. **Functional style** - Immutable data structures and pure functions

### API design principles

1. **Explicit over implicit** - Generators are explicit, not type-directed
2. **Composable** - Small, composable functions over large APIs
3. **Ergonomic** - Natural TypeScript/JavaScript idioms
4. **Predictable** - Deterministic behavior with seed control

## Success criteria

1. **Preserve core innovation** - Integrated shrinking must work correctly
2. **TypeScript ergonomics** - Feel natural to TypeScript developers
3. **Performance** - Efficient generation and shrinking
4. **Ecosystem fit** - Work with existing test frameworks
5. **Documentation** - Clear examples and migration guides

## CONSIDER items

- WebAssembly for performance-critical shrinking
- Worker threads for parallel test execution
- Browser compatibility for client-side testing
- Streaming generators for large data sets

## FUTURE possibilities

- Visual debugging tools for shrinking paths
- Property-based mutation testing
- Integration with fuzzing tools
- Machine learning guided generation