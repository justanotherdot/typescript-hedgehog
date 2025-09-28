import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { fromSchema } from '../index.js';
import { Size } from '@/data/size.js';
import { Seed } from '@/data/seed.js';

describe('Record type generation', () => {
  it('generates basic record with string keys', () => {
    const schema = z.record(z.number());
    const gen = fromSchema(schema);

    const tree = gen.generate(Size.of(10), Seed.fromNumber(42));

    expect(typeof tree.value).toBe('object');
    expect(tree.value).not.toBeNull();

    // Should have string keys and number values
    const entries = Object.entries(tree.value);
    expect(entries.length).toBeGreaterThan(0);

    for (const [key, value] of entries) {
      expect(typeof key).toBe('string');
      expect(typeof value).toBe('number');
    }
  });

  it('generates record with enum keys', () => {
    const keyEnum = z.enum(['red', 'green', 'blue']);
    const schema = z.record(keyEnum, z.string());
    const gen = fromSchema(schema);

    const tree = gen.generate(Size.of(10), Seed.fromNumber(42));

    expect(typeof tree.value).toBe('object');
    expect(tree.value).not.toBeNull();

    // Should have enum keys
    const keys = Object.keys(tree.value);
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      expect(['red', 'green', 'blue']).toContain(key);
    }

    // All values should be strings
    for (const value of Object.values(tree.value)) {
      expect(typeof value).toBe('string');
    }
  });

  it('generates record with native enum keys', () => {
    enum Color {
      Red = 'red',
      Green = 'green',
      Blue = 'blue',
    }

    const schema = z.record(z.nativeEnum(Color), z.number());
    const gen = fromSchema(schema);

    const tree = gen.generate(Size.of(10), Seed.fromNumber(42));

    expect(typeof tree.value).toBe('object');
    expect(tree.value).not.toBeNull();

    // Should have enum keys
    const keys = Object.keys(tree.value);
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      expect(Object.values(Color)).toContain(key);
    }

    // All values should be numbers
    for (const value of Object.values(tree.value)) {
      expect(typeof value).toBe('number');
    }
  });

  it('generates record with numeric native enum keys', () => {
    enum Status {
      Draft,
      Published,
      Archived,
    }

    const schema = z.record(z.nativeEnum(Status), z.string());
    const gen = fromSchema(schema);

    const tree = gen.generate(Size.of(10), Seed.fromNumber(42));

    expect(typeof tree.value).toBe('object');
    expect(tree.value).not.toBeNull();

    // Should have numeric enum keys (as strings in the object)
    const keys = Object.keys(tree.value);
    expect(keys.length).toBeGreaterThan(0);

    // For numeric enums, the keys should be the numeric values as strings
    for (const key of keys) {
      const numKey = Number(key);
      expect(numKey >= 0 && numKey <= 2).toBe(true);
    }
  });

  it('generates record with string literal union keys', () => {
    const schema = z.record(
      z.union([z.literal('name'), z.literal('email'), z.literal('phone')]),
      z.string()
    );
    const gen = fromSchema(schema);

    const tree = gen.generate(Size.of(10), Seed.fromNumber(42));

    expect(typeof tree.value).toBe('object');
    expect(tree.value).not.toBeNull();

    // Should have union literal keys
    const keys = Object.keys(tree.value);
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      expect(['name', 'email', 'phone']).toContain(key);
    }
  });

  it('validates generated records against their schemas', () => {
    const testCases = [
      z.record(z.number()),
      z.record(z.enum(['a', 'b', 'c']), z.string()),
      z.record(z.string(), z.boolean()),
    ];

    for (const schema of testCases) {
      const gen = fromSchema(schema);
      const tree = gen.generate(Size.of(10), Seed.fromNumber(42));

      const result = schema.safeParse(tree.value);
      if (!result.success) {
        // console.error('Schema:', schema);
        // console.error('Generated:', tree.value);
        // console.error('Error:', result.error);
      }
      expect(result.success).toBe(true);
    }
  });
});
