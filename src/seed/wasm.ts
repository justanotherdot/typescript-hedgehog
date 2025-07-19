/**
 * WASM SplitMix64 implementation for maximum performance.
 *
 * This provides a high-performance WebAssembly implementation of SplitMix64
 * compiled from Rust. Requires the WASM module to be built first.
 *
 * Build with: npm run build:wasm
 */

import * as wasm from '../../hedgehog-splitmix-wasm/pkg/hedgehog_splitmix_wasm.js';

/**
 * Pure WASM SplitMix64 seed implementation.
 * No fallbacks - if WASM fails to load, this will throw.
 * Use hedgehog/seed/bigint if you need a pure JavaScript implementation.
 */
export class Seed {
  private wasmSeed: wasm.Seed;

  private constructor(wasmSeed: wasm.Seed) {
    this.wasmSeed = wasmSeed;
  }

  static fromNumber(value: number): Seed {
    const wasmSeed = new wasm.Seed(BigInt(Math.floor(value)));
    return new Seed(wasmSeed);
  }

  static fromParts(state: bigint, gamma: bigint): Seed {
    const wasmSeed = wasm.Seed.from_parts(state, gamma);
    return new Seed(wasmSeed);
  }

  get state(): bigint {
    return this.wasmSeed.state;
  }

  get gamma(): bigint {
    return this.wasmSeed.gamma;
  }

  nextBounded(bound: number): [number, Seed] {
    const result = this.wasmSeed.next_bounded(BigInt(bound));
    return [Number(result.value), new Seed(result.seed)];
  }

  nextBool(): [boolean, Seed] {
    const result = this.wasmSeed.next_bool();
    return [result.value, new Seed(result.seed)];
  }

  split(): [Seed, Seed] {
    const pair = this.wasmSeed.split();
    return [new Seed(pair.left), new Seed(pair.right)];
  }

  toString(): string {
    return `Seed(${this.state}, ${this.gamma})`;
  }

  static getImplementation(): 'wasm' {
    return 'wasm';
  }

  static isWasmAvailable(): boolean {
    return true; // Pure WASM implementation, always available if module loads
  }
}

// Export detection function for compatibility
export function isWasmAvailable(): boolean {
  return true;
}
