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

### Phase 3: Collection generators ✅ **COMPLETED**

**DONE:**
- [x] Array generators with size control
- [x] Object generators with property selection  
- [x] Recursive generators for nested structures
- [x] Tuple generators
- [x] Union type generators (optional, nullable, discriminated unions)

**Key files:**
- `src/gen/collection.ts` - Array and object generators
- `src/gen/union.ts` - Union type generators

### Phase 4: Property testing core ✅ **COMPLETED**

**DONE:**
- [x] Property definition and execution
- [x] Test configuration (test count, shrink limit, size)
- [x] Shrinking algorithm implementation
- [x] Result types and reporting
- [x] Extended primitive generators (number, date, enum, literal)
- [x] ShrinkBuilder utility for consistent shrinking patterns

**Key files:**
- `src/property.ts` - Property definition and execution
- `src/config.ts` - Test configuration 
- `src/gen/shrink.ts` - Shrinking utilities and patterns
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
- Generating property-based tests from Zod schemas

## Shrinking sophistication analysis

Based on comparison with the Rust hedgehog implementation, our current shrinking has room for significant improvement:

### Current implementation (6/10 sophistication)

**Strengths:**
- Covers fundamental shrinking patterns
- `ShrinkBuilder` utility provides consistency
- Basic coverage of main data types (numbers, strings, collections, unions)
- Clean rose tree structure with breadth-first exploration

**Gaps:**
- Simple linear shrinking (halfway to origin, then origin)
- Basic character simplification (only uppercase→lowercase, special→space)
- Limited collection strategies (just length reduction and element-wise)
- Manual shrink construction vs automatic composition

### Rust implementation reference (9/10 sophistication)

**Advanced features we could adopt:**

**Algorithmic improvements:**
- **Binary search shrinking** for numeric values (more efficient shrinking paths)
- **Distribution-aware shrinking** that respects the original generator distribution
- **Smart collection removal** (chunks, quarters, halves, smart element removal)
- **Comprehensive character hierarchy** (uppercase→lowercase→simple→'a'/'0'/' ')

**Structural improvements:**
- **Automatic shrinking composition** through monadic generator design
- **Lazy shrinking evaluation** for better performance
- **Sophisticated tree operations** (`expand`, `filter` with shrink preservation)
- **Rich debugging tools** (tree rendering, visualization, shrink path analysis)

**Data type coverage:**
- **Deep nested type shrinking** (e.g., `Vec<Option<String>>` with proper composition)
- **Constraint-preserving shrinking** for filtered generators
- **Size-aware shrinking** that respects original size parameters

### Recommended improvements (priority order)

**High priority:**
1. **Binary search numeric shrinking** - Replace linear shrinking with binary search
2. **Advanced collection strategies** - Implement chunk removal and smart element removal
3. **Character simplification hierarchy** - Complete character shrinking taxonomy
4. **Tree debugging tools** - Add `render()`, `render_compact()` for visualization

**Medium priority:**
5. **Distribution-aware shrinking** - Make shrinking respect original distributions
6. **Automatic composition** - Improve shrinking propagation through combinators
7. **Constraint preservation** - Ensure filtered generators maintain constraints during shrinking

**Low priority:**
8. **Lazy evaluation** - Optimize shrinking performance through lazy tree construction
9. **Deep nested shrinking** - Handle complex nested types with proper composition
10. **Performance optimization** - Profile and optimize shrinking algorithms

This analysis shows clear paths for improving our shrinking sophistication while maintaining the clean TypeScript architecture we've established.