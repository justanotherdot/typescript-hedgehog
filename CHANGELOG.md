# Changelog

## [Unreleased]

## [0.1.1] - 2025-09-28

### Changed
- Converted to npm workspace architecture for better monorepo management
- Restructured bin scripts to use workspace commands for better portability
- Updated CI workflows to support workspace structure

### Added
- Semantic versioning release script (bin/release-version-bump) with patch/minor/major support
- Package-specific vitest configuration for improved module resolution
- Workspace-aware linting and build processes

### Fixed
- Module resolution issues with @/ path aliases in workspace structure
- Benchmark scripts now run once instead of in watch mode
- ESLint configuration properly inherits across workspace packages

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

[0.1.1]: https://github.com/justanotherdot/typescript-hedgehog/releases/tag/0.1.1
[0.1.0]: https://github.com/justanotherdot/typescript-hedgehog/releases/tag/0.1.0