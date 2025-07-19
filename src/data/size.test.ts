import { describe, test, expect } from 'vitest';
import { Size, Range, Distribution, Ranges } from './size';

describe('Size', () => {
  test('creates size with valid value', () => {
    const size = Size.of(42);
    expect(size.get()).toBe(42);
    expect(size.toString()).toBe('Size(42)');
  });

  test('throws error for negative size', () => {
    expect(() => Size.of(-1)).toThrow('Size must be non-negative');
  });

  test('accepts zero size', () => {
    const size = Size.of(0);
    expect(size.get()).toBe(0);
  });

  test('scales size by factor', () => {
    const size = Size.of(10);
    expect(size.scale(2).get()).toBe(20);
    expect(size.scale(0.5).get()).toBe(5);
    expect(size.scale(0).get()).toBe(0);
  });

  test('clamps size to maximum', () => {
    const size = Size.of(100);
    expect(size.clamp(50).get()).toBe(50);
    expect(size.clamp(150).get()).toBe(100);
    expect(size.clamp(100).get()).toBe(100);
  });

  test('applies golden ratio scaling', () => {
    const size = Size.of(100);
    const golden = size.golden();
    expect(golden.get()).toBe(61); // floor(100 * 0.61803398875)
  });
});

describe('Range', () => {
  test('creates uniform range', () => {
    const range = Range.uniform(1, 10);
    expect(range.min).toBe(1);
    expect(range.max).toBe(10);
    expect(range.origin).toBe(null);
    expect(range.distribution).toBe(Distribution.Uniform);
  });

  test('creates linear range', () => {
    const range = Range.linear(0, 100);
    expect(range.distribution).toBe(Distribution.Linear);
  });

  test('creates exponential range', () => {
    const range = Range.exponential(1, 1000);
    expect(range.distribution).toBe(Distribution.Exponential);
  });

  test('creates constant range', () => {
    const range = Range.constant(42);
    expect(range.min).toBe(42);
    expect(range.max).toBe(42);
    expect(range.origin).toBe(42);
    expect(range.distribution).toBe(Distribution.Constant);
  });

  test('throws error for invalid range', () => {
    expect(() => Range.uniform(10, 5)).toThrow('Range min must be <= max');
  });

  test('sets origin', () => {
    const range = Range.uniform(0, 100).withOrigin(50);
    expect(range.origin).toBe(50);
  });

  test('checks if value is in range', () => {
    const range = Range.uniform(10, 20);
    expect(range.contains(15)).toBe(true);
    expect(range.contains(10)).toBe(true);
    expect(range.contains(20)).toBe(true);
    expect(range.contains(5)).toBe(false);
    expect(range.contains(25)).toBe(false);
  });

  test('calculates range size', () => {
    const range = Range.uniform(10, 20);
    expect(range.size()).toBe(10);
    
    const pointRange = Range.constant(42);
    expect(pointRange.size()).toBe(0);
  });
});

describe('Distribution', () => {
  test('has correct enum values', () => {
    expect(Distribution.Uniform).toBe('uniform');
    expect(Distribution.Linear).toBe('linear');
    expect(Distribution.Exponential).toBe('exponential');
    expect(Distribution.Constant).toBe('constant');
  });
});

describe('Ranges', () => {
  test('positive range', () => {
    const range = Ranges.positive();
    expect(range.min).toBe(1);
    expect(range.max).toBe(Number.MAX_SAFE_INTEGER);
    expect(range.origin).toBe(1);
    expect(range.distribution).toBe(Distribution.Linear);
  });

  test('natural range', () => {
    const range = Ranges.natural();
    expect(range.min).toBe(0);
    expect(range.max).toBe(Number.MAX_SAFE_INTEGER);
    expect(range.origin).toBe(0);
    expect(range.distribution).toBe(Distribution.Linear);
  });

  test('small positive range', () => {
    const range = Ranges.smallPositive();
    expect(range.min).toBe(1);
    expect(range.max).toBe(100);
    expect(range.origin).toBe(1);
    expect(range.distribution).toBe(Distribution.Uniform);
  });

  test('unit range', () => {
    const range = Ranges.unit();
    expect(range.min).toBe(0.0);
    expect(range.max).toBe(1.0);
    expect(range.origin).toBe(0.0);
    expect(range.distribution).toBe(Distribution.Uniform);
  });

  test('normal range', () => {
    const range = Ranges.normal();
    expect(range.min).toBe(-3.0);
    expect(range.max).toBe(3.0);
    expect(range.origin).toBe(0);
    expect(range.distribution).toBe(Distribution.Uniform);
  });
});