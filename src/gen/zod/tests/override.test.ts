import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createCustomRegistry } from '../core/zod.js';
import { Gen } from '@/gen.js';
import { Size } from '@/data/size.js';
import { Seed } from '@/data/seed.js';

describe('Zod override system', () => {
  it('allows overriding specific schema instances', () => {
    const emailSchema = z.string().email();
    const customRegistry = createCustomRegistry().override(
      emailSchema,
      Gen.constant('custom@example.com').generator
    );

    const gen = customRegistry.fromSchema(emailSchema);
    const size = Size.of(10);
    const seed = Seed.fromNumber(42);
    const tree = gen.generate(size, seed);

    expect(tree.value).toBe('custom@example.com');
  });

  it('uses normal generation for non-overridden schemas', () => {
    const emailSchema = z.string().email();
    const otherEmailSchema = z.string().email(); // Different instance

    const customRegistry = createCustomRegistry().override(
      emailSchema,
      Gen.constant('custom@example.com').generator
    );

    // Original schema should use override
    const overriddenGen = customRegistry.fromSchema(emailSchema);
    const overriddenTree = overriddenGen.generate(
      Size.of(10),
      Seed.fromNumber(42)
    );
    expect(overriddenTree.value).toBe('custom@example.com');

    // Different schema instance should use normal generation
    const normalGen = customRegistry.fromSchema(otherEmailSchema);
    const normalTree = normalGen.generate(Size.of(10), Seed.fromNumber(42));
    expect(normalTree.value).not.toBe('custom@example.com');
    expect(normalTree.value).toContain('@'); // Still a valid email
  });

  it('supports overriding complex schemas', () => {
    const userSchema = z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
    });

    const customUser = {
      id: 999,
      name: 'Test User',
      email: 'test@override.com',
    };

    const customRegistry = createCustomRegistry().override(
      userSchema,
      Gen.constant(customUser).generator
    );

    const gen = customRegistry.fromSchema(userSchema);
    const tree = gen.generate(Size.of(10), Seed.fromNumber(42));

    expect(tree.value).toEqual(customUser);
  });

  it('override chaining works correctly', () => {
    const schema1 = z.string();
    const schema2 = z.number();

    const customRegistry = createCustomRegistry()
      .override(schema1, Gen.constant('overridden').generator)
      .override(schema2, Gen.constant(999).generator);

    const gen1 = customRegistry.fromSchema(schema1);
    const gen2 = customRegistry.fromSchema(schema2);

    expect(gen1.generate(Size.of(10), Seed.fromNumber(42)).value).toBe(
      'overridden'
    );
    expect(gen2.generate(Size.of(10), Seed.fromNumber(42)).value).toBe(999);
  });
});
