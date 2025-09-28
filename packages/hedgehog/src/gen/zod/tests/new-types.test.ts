import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { fromSchema } from '../index.js';
import { Size } from '@/data/size.js';
import { Seed } from '@/data/seed.js';

describe('New Zod types integration', () => {
  // Test helper to generate and validate a schema
  function testSchema<T>(schema: z.ZodSchema<T>, iterations = 5) {
    const gen = fromSchema(schema);

    for (let i = 0; i < iterations; i++) {
      const size = Size.of(10); // Use smaller size for faster tests
      const seed = Seed.fromNumber(42 + i);
      const tree = gen.generate(size, seed);

      const result = schema.safeParse(tree.value);
      expect(result.success).toBe(true);
    }
  }

  describe('new supported types', () => {
    it('ZodMap - basic map', () => {
      testSchema(z.map(z.string(), z.number()));
    });

    it('ZodSet - basic set', () => {
      testSchema(z.set(z.string()));
    });

    it('ZodIntersection - basic intersection', () => {
      testSchema(
        z.intersection(
          z.object({ name: z.string() }),
          z.object({ age: z.number() })
        )
      );
    });

    it('ZodDiscriminatedUnion - basic discriminated union', () => {
      testSchema(
        z.discriminatedUnion('type', [
          z.object({ type: z.literal('a'), value: z.string() }),
          z.object({ type: z.literal('b'), value: z.number() }),
        ])
      );
    });

    it('ZodNativeEnum - string native enum', () => {
      enum Color {
        Red = 'red',
        Green = 'green',
        Blue = 'blue',
      }
      testSchema(z.nativeEnum(Color));
    });

    it('ZodNativeEnum - numeric native enum', () => {
      enum Direction {
        Up,
        Down,
        Left,
        Right,
      }
      testSchema(z.nativeEnum(Direction));
    });

    it('ZodFunction - basic function', () => {
      testSchema(z.function());
    });

    it('ZodLazy - basic lazy', () => {
      const schema = z.lazy(() => z.string());
      testSchema(schema);
    });
  });
});
