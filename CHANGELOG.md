# Changelog

## [Unreleased]

## [0.1.2] - 2025-09-28

### Breaking Changes
- Zod integration moved to separate import: `import { fromSchema } from '@justanotherdot/hedgehog/zod'`
- `Gen.fromSchema()` now throws helpful error directing users to new import

### Fixed
- **CRITICAL**: Fixed WASM module format issue preventing package usage in ES module environments
- **CRITICAL**: Made zod dependency truly optional - package now works without installing zod
- WASM package now generates proper ES modules instead of CommonJS syntax

### Added
- Separate zod entry point at `@justanotherdot/hedgehog/zod` for optional zod integration
- Clear error messages when zod features are used without zod installed
- Improved package exports for better module resolution
- Comprehensive examples directory with basic usage, advanced configuration, and Zod integration
- Updated README with correct v0.1.2 API usage and practical examples
- Documentation for proper Config usage and property testing patterns

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

[0.1.2]: https://github.com/justanotherdot/typescript-hedgehog/releases/tag/0.1.2
[0.1.1]: https://github.com/justanotherdot/typescript-hedgehog/releases/tag/0.1.1
[0.1.0]: https://github.com/justanotherdot/typescript-hedgehog/releases/tag/0.1.0