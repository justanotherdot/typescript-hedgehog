/**
 * A rose tree containing a value and its shrink possibilities.
 *
 * Trees are used to represent generated values along with their
 * possible shrinks, enabling automatic shrinking of failing test cases.
 */
export class Tree<T> {
  constructor(
    public readonly value: T,
    public readonly children: Tree<T>[] = []
  ) {}

  /**
   * Create a new tree with the given value and no children.
   */
  static singleton<T>(value: T): Tree<T> {
    return new Tree(value);
  }

  /**
   * Create a new tree with the given value and children.
   */
  static withChildren<T>(value: T, children: Tree<T>[]): Tree<T> {
    return new Tree(value, children);
  }

  /**
   * Map a function over the tree values.
   */
  map<U>(f: (value: T) => U): Tree<U> {
    return new Tree(
      f(this.value),
      this.children.map((child) => child.map(f))
    );
  }

  /**
   * Apply a function to the tree value and collect all results.
   */
  bind<U>(f: (value: T) => Tree<U>): Tree<U> {
    const newTree = f(this.value);
    const mappedChildren = this.children.map((child) => child.bind(f));

    return new Tree(newTree.value, [...newTree.children, ...mappedChildren]);
  }

  /**
   * Get all possible shrink values in breadth-first order.
   */
  shrinks(): T[] {
    const result: T[] = [];
    const queue: Tree<T>[] = [...this.children];

    while (queue.length > 0) {
      const tree = queue.shift()!;
      result.push(tree.value);
      queue.push(...tree.children);
    }

    return result;
  }

  /**
   * Expand the tree to a given depth, collecting all values.
   */
  expand(maxDepth: number): T[] {
    const result: T[] = [this.value];
    this.expandRecursive(result, maxDepth, 0);
    return result;
  }

  private expandRecursive(
    result: T[],
    maxDepth: number,
    currentDepth: number
  ): void {
    if (currentDepth >= maxDepth) {
      return;
    }

    for (const child of this.children) {
      result.push(child.value);
      child.expandRecursive(result, maxDepth, currentDepth + 1);
    }
  }

  /**
   * Filter the tree, keeping only values that satisfy the predicate.
   */
  filter(predicate: (value: T) => boolean): Tree<T> | null {
    if (!predicate(this.value)) {
      return null;
    }

    const filteredChildren = this.children
      .map((child) => child.filter(predicate))
      .filter((child): child is Tree<T> => child !== null);

    return new Tree(this.value, filteredChildren);
  }

  /**
   * Get the value from the tree.
   */
  outcome(): T {
    return this.value;
  }

  /**
   * Check if the tree has any children (shrinks).
   */
  hasShrinks(): boolean {
    return this.children.length > 0;
  }

  /**
   * Count the total number of nodes in the tree.
   */
  countNodes(): number {
    return (
      1 + this.children.reduce((sum, child) => sum + child.countNodes(), 0)
    );
  }

  /**
   * Get the depth of the tree.
   */
  depth(): number {
    if (this.children.length === 0) {
      return 1;
    }
    return 1 + Math.max(...this.children.map((child) => child.depth()));
  }

  /**
   * Convert tree to string representation.
   */
  toString(): string {
    if (this.children.length === 0) {
      return `Tree(${this.value})`;
    }
    return `Tree(${this.value}, [${this.children.map((c) => c.toString()).join(', ')}])`;
  }
}
