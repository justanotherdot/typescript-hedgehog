/**
 * WASM SplitMix64 implementation for maximum performance.
 *
 * This provides a high-performance WebAssembly implementation of SplitMix64
 * compiled from Rust. Requires the WASM module to be built first.
 *
 * Build with: npm run build:wasm
 */

import * as wasm from '@justanotherdot/hedgehog-splitmix-wasm';
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
    // Use buffer API for large batches (>100 elements) for better performance
    if (count > 100) {
      return this.nextBoundedBulkBuffer(count, bound);
    }

    // Use individual calls for small batches to avoid buffer allocation overhead
    const values: number[] = [];
    let currentSeed: Seed = this;

    for (let i = 0; i < count; i++) {
      const [value, newSeed] = currentSeed.nextBounded(bound);
      values.push(value);
      currentSeed = newSeed;
    }

    return { values, finalSeed: currentSeed };
  }

  /**
   * High-performance bulk generation using direct memory access.
   * Uses a shared buffer to minimize JavaScript/WASM boundary crossings.
   */
  nextBoundedBulkBuffer(
    count: number,
    bound: number
  ): { values: number[]; finalSeed: BulkSeed } {
    const format = 0; // DataFormat::U32LE
    const headerSize = 9; // 1 byte format + 8 bytes count
    const bytesPerElement = 4;
    const bufferSize = headerSize + count * bytesPerElement;

    const buffer = new Uint8Array(bufferSize);

    try {
      const finalSeed = this.wasmSeed.fill_buffer(
        buffer,
        format,
        BigInt(count),
        bound
      );

      // Read header to validate format and count
      const receivedFormat = buffer[0];
      const receivedCount = new DataView(buffer.buffer).getBigUint64(1, true);

      if (receivedFormat !== format) {
        throw new Error(
          `Format mismatch: expected ${format}, got ${receivedFormat}`
        );
      }

      if (receivedCount !== BigInt(count)) {
        throw new Error(
          `Count mismatch: expected ${count}, got ${receivedCount}`
        );
      }

      // Extract values using DataView for proper endianness handling
      const values: number[] = [];
      const dataView = new DataView(buffer.buffer, headerSize);

      for (let i = 0; i < count; i++) {
        values.push(dataView.getUint32(i * bytesPerElement, true)); // true = little-endian
      }

      return { values, finalSeed: new Seed(finalSeed) };
    } catch (error) {
      throw new Error(`Buffer operation failed: ${error}`);
    }
  }

  /**
   * Generate bulk random floats in [0, 1) range using buffer API.
   */
  nextFloatsBulkBuffer(count: number): {
    values: number[];
    finalSeed: BulkSeed;
  } {
    const format = 1; // DataFormat::F64LE
    const headerSize = 9;
    const bytesPerElement = 8;
    const bufferSize = headerSize + count * bytesPerElement;

    const buffer = new Uint8Array(bufferSize);

    try {
      const finalSeed = this.wasmSeed.fill_buffer(
        buffer,
        format,
        BigInt(count),
        undefined
      );

      // Extract values
      const values: number[] = [];
      const dataView = new DataView(buffer.buffer, headerSize);

      for (let i = 0; i < count; i++) {
        values.push(dataView.getFloat64(i * bytesPerElement, true));
      }

      return { values, finalSeed: new Seed(finalSeed) };
    } catch (error) {
      throw new Error(`Float buffer operation failed: ${error}`);
    }
  }

  /**
   * Generate bulk random booleans using buffer API.
   */
  nextBoolsBulkBuffer(count: number): {
    values: boolean[];
    finalSeed: BulkSeed;
  } {
    const format = 2; // DataFormat::BoolU8
    const headerSize = 9;
    const bytesPerElement = 1;
    const bufferSize = headerSize + count * bytesPerElement;

    const buffer = new Uint8Array(bufferSize);

    try {
      const finalSeed = this.wasmSeed.fill_buffer(
        buffer,
        format,
        BigInt(count),
        undefined
      );

      // Extract values
      const values: boolean[] = [];

      for (let i = 0; i < count; i++) {
        values.push(buffer[headerSize + i] === 1);
      }

      return { values, finalSeed: new Seed(finalSeed) };
    } catch (error) {
      throw new Error(`Boolean buffer operation failed: ${error}`);
    }
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
