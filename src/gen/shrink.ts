/**
 * Shrinking utilities for property-based testing.
 *
 * This module provides standardized utilities for building shrink trees,
 * eliminating the duplication found throughout primitive, collection, and union generators.
 */

import { Tree } from '../data/tree.js';

/**
 * Builder utility for constructing shrink trees with common patterns.
 * Eliminates the repetitive shrink construction logic found across generators.
 */
export class ShrinkBuilder<T> {
  private shrinks: Tree<T>[] = [];

  /**
   * Add a single shrink value.
   */
  add(value: T): this {
    this.shrinks.push(Tree.singleton(value));
    return this;
  }

  /**
   * Add multiple shrink values.
   */
  addAll(values: T[]): this {
    for (const value of values) {
      this.shrinks.push(Tree.singleton(value));
    }
    return this;
  }

  /**
   * Add a shrink tree with its own children.
   */
  addTree(tree: Tree<T>): this {
    this.shrinks.push(tree);
    return this;
  }

  /**
   * Add shrinks from another tree's children.
   */
  addFromTree(tree: Tree<T>): this {
    if (tree.hasShrinks()) {
      for (const shrunkValue of tree.shrinks()) {
        this.shrinks.push(Tree.singleton(shrunkValue));
      }
    }
    return this;
  }

  /**
   * Add a shrink value with recursive shrinking.
   */
  addWithChildren(value: T, childShrinks: Tree<T>[]): this {
    this.shrinks.push(Tree.withChildren(value, childShrinks));
    return this;
  }

  /**
   * Build the final tree with the given value and collected shrinks.
   */
  build(value: T): Tree<T> {
    return Tree.withChildren(value, this.shrinks);
  }

  /**
   * Get the collected shrinks without building the tree.
   */
  getShrinks(): Tree<T>[] {
    return [...this.shrinks];
  }

  /**
   * Clear all collected shrinks.
   */
  clear(): this {
    this.shrinks = [];
    return this;
  }
}

/**
 * Create a new ShrinkBuilder instance.
 */
export function shrinkBuilder<T>(): ShrinkBuilder<T> {
  return new ShrinkBuilder<T>();
}

/**
 * Helper function for numeric shrinking towards an origin.
 * Common pattern for integers, floats, and bounded values.
 */
export function shrinkTowards(
  value: number,
  origin: number,
  isValid: (candidate: number) => boolean
): number[] {
  if (value === origin) {
    return [];
  }

  const shrinks: number[] = [];

  // Shrink towards origin
  const mid =
    value > origin
      ? Math.floor((value + origin) / 2)
      : Math.ceil((value + origin) / 2);

  if (mid !== value && isValid(mid)) {
    shrinks.push(mid);
  }

  // Try origin directly if valid
  if (isValid(origin)) {
    shrinks.push(origin);
  }

  return shrinks;
}

/**
 * Helper function for recursive numeric shrinking with constraints.
 */
export function buildNumericShrinks(
  value: number,
  origin: number,
  isValid: (candidate: number) => boolean
): Tree<number>[] {
  if (value === origin || !Number.isFinite(value) || !Number.isFinite(origin)) {
    return [];
  }

  const shrinks: Tree<number>[] = [];

  // Shrink towards origin
  const mid =
    value > origin
      ? Math.floor((value + origin) / 2)
      : Math.ceil((value + origin) / 2);

  // Ensure we're making progress and the mid value is different
  if (mid !== value && mid !== origin && Number.isFinite(mid) && isValid(mid)) {
    const childShrinks = buildNumericShrinks(mid, origin, isValid);
    shrinks.push(Tree.withChildren(mid, childShrinks));
  }

  // Try origin directly if valid
  if (origin !== value && isValid(origin)) {
    shrinks.push(Tree.singleton(origin));
  }

  return shrinks;
}

/**
 * Helper for length-based shrinking (strings, arrays).
 * Shrinks by reducing length towards zero.
 */
export function lengthShrinks<T>(
  items: T[],
  buildItem: (items: T[], length: number) => T
): Tree<T>[] {
  const shrinks: Tree<T>[] = [];

  for (let newLength = 0; newLength < items.length; newLength++) {
    const shorterItem = buildItem(items, newLength);
    shrinks.push(Tree.singleton(shorterItem));
  }

  return shrinks;
}
