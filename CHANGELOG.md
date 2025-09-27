# Changelog

## [Unreleased]

## [0.1.0] - 2025-01-27

### Added
- **Property-based testing** - Write tests that check properties across many generated inputs
- **Automatic test case generation** - Generate strings, numbers, objects, and arrays automatically
- **Smart shrinking** - When tests fail, automatically finds the smallest failing example
- **Zod integration** - Generate test data directly from your Zod schemas
- **High-performance random generation** - Optimized for speed with WebAssembly

### Performance
- Bulk operations show significant speedups in benchmarks (see `npm run bench`)
- WebAssembly implementation available for CPU-intensive workloads

[0.1.0]: https://github.com/justanotherdot/typescript-hedgehog/releases/tag/0.1.0