/**
 * WASM SplitMix64 implementation (TODO).
 *
 * This will contain the Rust-compiled WASM implementation
 * for maximum performance (~6x faster than BigInt).
 *
 * Implementation plan:
 * 1. Create Rust crate with wasm-bindgen
 * 2. Port SplitMix64 from existing Rust hedgehog crate
 * 3. Compile to WASM with wasm-pack
 * 4. Add TypeScript bindings
 * 5. Fallback to BigInt if WASM fails to load
 *
 * For now, re-export BigInt version as fallback.
 */
export { Seed } from './bigint';
