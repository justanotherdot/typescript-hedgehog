# typescript-hedgehog

Property-based testing library for TypeScript with high-performance WASM optimization.

## Workspace structure

This is a npm workspace containing:

- **`@justanotherdot/hedgehog`** - Main property-based testing library ([README](packages/hedgehog/))
- **`@justanotherdot/hedgehog-splitmix-wasm`** - WebAssembly bindings for SplitMix64 PRNG ([README](packages/hedgehog-splitmix-wasm/))

## Development

### Building

```bash
npm run build:all    # Build all packages
npm run build        # Build main package only
npm run build:wasm   # Build WASM package only
```

### Testing

```bash
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
```

### Code quality

```bash
npm run lint         # Lint code
npm run lint:fix     # Fix linting issues
npm run typecheck    # Type checking
```

### Benchmarks

```bash
npm run bench        # Run benchmarks
```

### Release

```bash
npm run release      # Create and publish release
```

## Requirements

- Node.js ≥20.16.0
- For WASM compilation: Rust toolchain with `wasm-pack`

## Usage

See [`packages/hedgehog/README.md`](packages/hedgehog/) for complete documentation, examples, and API reference.

## License

BSD-3-Clause