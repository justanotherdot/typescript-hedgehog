/**
 * WASM SplitMix64 implementation for maximum performance.
 *
 * This provides a high-performance WebAssembly implementation of SplitMix64
 * compiled from Rust. Requires the WASM module to be built first.
 *
 * Build with: npm run build:wasm
 */

import * as wasm from '../../hedgehog-splitmix-wasm/pkg/hedgehog_splitmix_wasm.js';
import { BulkSeed } from './interface.js';

/**
 * Pure WASM SplitMix64 seed implementation.
 * No fallbacks - if WASM fails to load, this will throw.
 * Use hedgehog/seed/bigint if you need a pure JavaScript implementation.
 */
export class Seed implements BulkSeed {
  private wasmSeed: wasm.Seed;

  private constructor(wasmSeed: wasm.Seed) {
    this.wasmSeed = wasmSeed;
  }

  static fromNumber(value: number): Seed {
    const wasmSeed = new wasm.Seed(BigInt(Math.floor(value)));
    return new Seed(wasmSeed);
  }

  static random(): Seed {
    const now =
      BigInt(Date.now()) * BigInt(Math.floor(Math.random() * 0x100000000));
    return Seed.fromNumber(Number(now & 0xffffffffn));
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

  nextUint32(): [number, Seed] {
    const result = this.wasmSeed.next_bounded(BigInt(0x100000000));
    return [Number(result.value), new Seed(result.seed)];
  }

  nextFloat(): [number, Seed] {
    const [value, newSeed] = this.nextUint32();
    return [value / 0x100000000, newSeed];
  }

  nextBool(): [boolean, Seed] {
    const result = this.wasmSeed.next_bool();
    return [result.value, new Seed(result.seed)];
  }

  split(): [Seed, Seed] {
    const pair = this.wasmSeed.split();
    return [new Seed(pair.left), new Seed(pair.right)];
  }

  /**
   * Generate multiple booleans in a single WASM call for better performance.
   * Returns array of booleans (as 0/1 values) and the final seed state.
   */
  nextBoolsBatch(count: number): { values: boolean[]; finalSeed: Seed } {
    const result = this.wasmSeed.next_bools_batch(count);
    const values = Array.from(result.values).map((v) => v === 1);
    return {
      values,
      finalSeed: new Seed(result.final_seed),
    };
  }

  // BulkSeed interface methods
  nextBools(count: number): { values: boolean[]; finalSeed: BulkSeed } {
    return this.nextBoolsBatch(count);
  }

  nextBoundedBulk(
    count: number,
    bound: number
  ): { values: number[]; finalSeed: BulkSeed } {
    const values: number[] = [];
    let currentSeed: Seed = this;

    for (let i = 0; i < count; i++) {
      const [value, newSeed] = currentSeed.nextBounded(bound);
      values.push(value);
      currentSeed = newSeed;
    }

    return { values, finalSeed: currentSeed };
  }

  getPerformanceInfo() {
    return {
      implementation: 'wasm',
      batchingAvailable: true,
      recommendedForBulkOps: true,
    };
  }

  toString(): string {
    return `Seed(${this.state}, ${this.gamma})`;
  }

  getImplementation(): string {
    return 'wasm';
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
