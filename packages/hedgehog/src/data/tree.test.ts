import { describe, test, expect } from 'vitest';
import { Tree } from './tree.js';

describe('Tree', () => {
  test('creates singleton tree', () => {
    const tree = Tree.singleton(42);
    expect(tree.value).toBe(42);
    expect(tree.children).toHaveLength(0);
    expect(tree.hasShrinks()).toBe(false);
  });

  test('creates tree with children', () => {
    const children = [Tree.singleton(1), Tree.singleton(2)];
    const tree = Tree.withChildren(10, children);
    expect(tree.value).toBe(10);
    expect(tree.children).toHaveLength(2);
    expect(tree.hasShrinks()).toBe(true);
  });

  test('maps over tree values', () => {
    const tree = Tree.withChildren(10, [
      Tree.singleton(5),
      Tree.withChildren(3, [Tree.singleton(1)]),
    ]);

    const mapped = tree.map((x) => x * 2);
    expect(mapped.value).toBe(20);
    expect(mapped.children[0].value).toBe(10);
    expect(mapped.children[1].value).toBe(6);
    expect(mapped.children[1].children[0].value).toBe(2);
  });

  test('binds tree with function', () => {
    const tree = Tree.singleton(5);
    const bound = tree.bind((x) =>
      Tree.withChildren(x * 2, [Tree.singleton(x)])
    );

    expect(bound.value).toBe(10);
    expect(bound.children).toHaveLength(1);
    expect(bound.children[0].value).toBe(5);
  });

  test('gets shrinks in breadth-first order', () => {
    const tree = Tree.withChildren(10, [
      Tree.withChildren(5, [Tree.singleton(2)]),
      Tree.singleton(0),
      Tree.withChildren(3, [Tree.singleton(1)]),
    ]);

    const shrinks = tree.shrinks();
    expect(shrinks).toEqual([5, 0, 3, 2, 1]);
  });

  test('expands tree to given depth', () => {
    const tree = Tree.withChildren(10, [
      Tree.withChildren(5, [Tree.withChildren(2, [Tree.singleton(1)])]),
    ]);

    const expanded = tree.expand(2);
    expect(expanded).toEqual([10, 5, 2]);

    const fullyExpanded = tree.expand(10);
    expect(fullyExpanded).toEqual([10, 5, 2, 1]);
  });

  test('filters tree with predicate', () => {
    const tree = Tree.withChildren(5, [
      Tree.singleton(3),
      Tree.singleton(15),
      Tree.withChildren(8, [Tree.singleton(2), Tree.singleton(12)]),
    ]);

    const filtered = tree.filter((x) => x < 10);
    expect(filtered).not.toBeNull();
    expect(filtered!.value).toBe(5);
    expect(filtered!.children).toHaveLength(2); // 3 and 8 (with child 2)
    expect(filtered!.children[0].value).toBe(3);
    expect(filtered!.children[1].value).toBe(8);
    expect(filtered!.children[1].children).toHaveLength(1);
    expect(filtered!.children[1].children[0].value).toBe(2);
  });

  test('filters out root that fails predicate', () => {
    const tree = Tree.singleton(15);
    const filtered = tree.filter((x) => x < 10);
    expect(filtered).toBeNull();
  });

  test('gets outcome value', () => {
    const tree = Tree.singleton(42);
    expect(tree.outcome()).toBe(42);
  });

  test('counts total nodes', () => {
    const tree = Tree.withChildren(1, [
      Tree.singleton(2),
      Tree.withChildren(3, [Tree.singleton(4), Tree.singleton(5)]),
    ]);

    expect(tree.countNodes()).toBe(5); // 1 + 2 + 3 + 4 + 5
  });

  test('calculates tree depth', () => {
    const singleton = Tree.singleton(1);
    expect(singleton.depth()).toBe(1);

    const tree = Tree.withChildren(1, [
      Tree.singleton(2),
      Tree.withChildren(3, [Tree.withChildren(4, [Tree.singleton(5)])]),
    ]);

    expect(tree.depth()).toBe(4); // 1 -> 3 -> 4 -> 5
  });

  test('converts to string representation', () => {
    const singleton = Tree.singleton(42);
    expect(singleton.toString()).toBe('Tree(42)');

    const withChildren = Tree.withChildren(10, [Tree.singleton(5)]);
    expect(withChildren.toString()).toBe('Tree(10, [Tree(5)])');
  });

  test('handles empty children array', () => {
    const tree = Tree.withChildren(42, []);
    expect(tree.hasShrinks()).toBe(false);
    expect(tree.shrinks()).toEqual([]);
    expect(tree.countNodes()).toBe(1);
    expect(tree.depth()).toBe(1);
  });

  test('complex tree operations', () => {
    // Build a more complex tree: integers shrinking towards 0
    const buildIntTree = (n: number): Tree<number> => {
      if (n <= 0) return Tree.singleton(n);
      return Tree.withChildren(n, [
        buildIntTree(Math.floor(n / 2)),
        Tree.singleton(0),
      ]);
    };

    const tree = buildIntTree(8);
    expect(tree.value).toBe(8);
    expect(tree.shrinks()).toEqual([4, 0, 2, 0, 1, 0, 0, 0]);
    expect(tree.countNodes()).toBe(9);
    expect(tree.depth()).toBe(5);
  });

  test('prevents infinite recursion in deep tree structures', () => {
    // Create a very deep tree manually
    let deepTree = Tree.singleton(0);
    for (let i = 1; i < 1000; i++) {
      deepTree = Tree.withChildren(i, [deepTree]);
    }

    // Should not stack overflow
    expect(deepTree.depth()).toBe(1000);
    expect(deepTree.countNodes()).toBe(1000);
  });

  test('tree filter with complex predicates', () => {
    const complexTree = Tree.withChildren(12, [
      // 12 % 3 === 0
      Tree.withChildren(5, [Tree.singleton(1), Tree.singleton(2)]),
      Tree.withChildren(15, [Tree.singleton(12), Tree.singleton(18)]),
    ]);

    // Filter that keeps only multiples of 3
    const filtered = complexTree.filter((x) => x % 3 === 0);
    expect(filtered).not.toBeNull();
    expect(filtered!.value).toBe(12);
    expect(filtered!.children).toHaveLength(1); // Only the 15 branch
    expect(filtered!.children[0].children).toHaveLength(2); // Both 12 and 18
  });

  test('memory usage with large shrink trees', () => {
    // Build tree with many shrinks but not too deep
    const buildManyShrinksTree = (n: number): Tree<number> => {
      if (n <= 1) return Tree.singleton(n);
      const shrinks = Array.from({ length: Math.min(10, n) }, (_, i) =>
        Tree.singleton(i)
      );
      return Tree.withChildren(n, shrinks);
    };

    const tree = buildManyShrinksTree(50);

    // Should be able to get shrinks without memory issues
    const shrinks = tree.shrinks();
    expect(Array.isArray(shrinks)).toBe(true);
    expect(shrinks.length).toBe(10);

    // Should be able to count nodes efficiently
    const nodeCount = tree.countNodes();
    expect(nodeCount).toBe(11); // Root + 10 children
  });
});
