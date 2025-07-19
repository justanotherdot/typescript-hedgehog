import { describe, test, expectTypeOf } from 'vitest';
import { Gen } from './gen';
import { Tree } from './data/tree';
import { Size, Range } from './data/size';
import { Seed } from './data/seed';
import { bool, int, string } from './gen/primitive';
import { Property, forAll } from './property';
import { TestResult, PassResult, FailResult } from './result';

describe('Type Safety', () => {
  test('Gen type inference', () => {
    const numGen = Gen.constant(42);
    expectTypeOf(numGen).toEqualTypeOf<Gen<number>>();
    
    const stringGen = numGen.map(n => n.toString());
    expectTypeOf(stringGen).toEqualTypeOf<Gen<string>>();
    
    const boundGen = numGen.bind(n => Gen.constant(n > 10));
    expectTypeOf(boundGen).toEqualTypeOf<Gen<boolean>>();
  });

  test('Tree type inference', () => {
    const numTree = Tree.singleton(42);
    expectTypeOf(numTree).toEqualTypeOf<Tree<number>>();
    
    const stringTree = numTree.map(n => n.toString());
    expectTypeOf(stringTree).toEqualTypeOf<Tree<string>>();
    
    const boundTree = numTree.bind(n => Tree.singleton(n > 10));
    expectTypeOf(boundTree).toEqualTypeOf<Tree<boolean>>();
  });

  test('primitive generator types', () => {
    expectTypeOf(bool()).toEqualTypeOf<Gen<boolean>>();
    expectTypeOf(int(Range.uniform(1, 10))).toEqualTypeOf<Gen<number>>();
    expectTypeOf(string()).toEqualTypeOf<Gen<string>>();
  });

  test('Gen combinator types', () => {
    const gen1 = Gen.constant(1);
    const gen2 = Gen.constant(2);
    const gen3 = Gen.constant(3);
    
    const choiceGen = Gen.oneOf([gen1, gen2, gen3]);
    expectTypeOf(choiceGen).toEqualTypeOf<Gen<number>>();
    
    const weightedGen = Gen.frequency([[1, gen1], [2, gen2]]);
    expectTypeOf(weightedGen).toEqualTypeOf<Gen<number>>();
    
    const listGen = Gen.list(gen1);
    expectTypeOf(listGen).toEqualTypeOf<Gen<number[]>>();
  });

  test('Property type inference', () => {
    const prop = forAll(int(Range.uniform(1, 100)), (n) => n > 0);
    expectTypeOf(prop).toEqualTypeOf<Property<number>>();
    
    const stringProp = forAll(string(), (s) => s.length >= 0);
    expectTypeOf(stringProp).toEqualTypeOf<Property<string>>();
  });

  test('TestResult type safety', () => {
    const prop = forAll(bool(), (b) => typeof b === 'boolean');
    const result = prop.run();
    
    expectTypeOf(result).toEqualTypeOf<TestResult<boolean>>();
    
    if (result.type === 'pass') {
      expectTypeOf(result).toEqualTypeOf<PassResult<boolean>>();
    } else if (result.type === 'fail') {
      expectTypeOf(result).toEqualTypeOf<FailResult<boolean>>();
      expectTypeOf(result.counterexample.value).toEqualTypeOf<boolean>();
    }
  });

  test('Size and Range types', () => {
    const size = Size.of(10);
    expectTypeOf(size.get()).toEqualTypeOf<number>();
    
    const range = Range.uniform(1, 10);
    expectTypeOf(range.min).toEqualTypeOf<number>();
    expectTypeOf(range.max).toEqualTypeOf<number>();
  });

  test('Seed type safety', () => {
    const seed = Seed.fromNumber(42);
    expectTypeOf(seed).toEqualTypeOf<Seed>();
    
    const [left, right] = seed.split();
    expectTypeOf(left).toEqualTypeOf<Seed>();
    expectTypeOf(right).toEqualTypeOf<Seed>();
    
    const [value, newSeed] = seed.nextBounded(100);
    expectTypeOf(value).toEqualTypeOf<number>();
    expectTypeOf(newSeed).toEqualTypeOf<Seed>();
  });

  test('Gen.sized type inference', () => {
    const sizedGen = Gen.sized(size => Gen.constant(size.get()));
    expectTypeOf(sizedGen).toEqualTypeOf<Gen<number>>();
  });

  test('Tree filter type narrowing', () => {
    const tree = Tree.singleton(42);
    const filtered = tree.filter(n => n > 0);
    expectTypeOf(filtered).toEqualTypeOf<Tree<number> | null>();
  });

  test('Gen filter preserves type', () => {
    const gen = int(Range.uniform(1, 100));
    const filtered = gen.filter(n => n % 2 === 0);
    expectTypeOf(filtered).toEqualTypeOf<Gen<number>>();
  });

  test('nested generator types', () => {
    const nestedGen = Gen.list(Gen.list(int(Range.uniform(1, 10))));
    expectTypeOf(nestedGen).toEqualTypeOf<Gen<number[][]>>();
    
    const complexGen = Gen.oneOf([
      Gen.constant('string'),
      Gen.constant(42),
      Gen.constant(true)
    ]);
    expectTypeOf(complexGen).toEqualTypeOf<Gen<string | number | boolean>>();
  });

  test('property combinators preserve types', () => {
    const numProp = forAll(int(Range.uniform(1, 100)), (n) => n > 0);
    const stringProp = forAll(string(), (s) => s.length >= 0);
    
    expectTypeOf(numProp).toEqualTypeOf<Property<number>>();
    expectTypeOf(stringProp).toEqualTypeOf<Property<string>>();
  });
});