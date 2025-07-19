/**
 * Tree rendering utilities for debugging and visualization.
 */

import { Tree } from './tree';

/**
 * Options for rendering trees.
 */
export interface RenderOptions {
  /** Maximum depth to render (prevents infinite output). */
  maxDepth?: number;
  /** Maximum number of children to show per node. */
  maxChildren?: number;
  /** Show indices for children. */
  showIndices?: boolean;
  /** Custom value formatter. */
  formatValue?: (value: any) => string;
}

/**
 * Render a tree as a string for debugging.
 */
export function renderTree<T>(
  tree: Tree<T>,
  options: RenderOptions = {}
): string {
  const opts = {
    maxDepth: 5,
    maxChildren: 10,
    showIndices: false,
    formatValue: (v: any) => String(v),
    ...options,
  };

  return renderTreeRecursive(tree, opts, 0, '');
}

/**
 * Render tree recursively with proper indentation.
 */
function renderTreeRecursive<T>(
  tree: Tree<T>,
  options: Required<RenderOptions>,
  depth: number,
  prefix: string
): string {
  const value = options.formatValue(tree.value);
  let result = `${prefix}${value}`;

  if (tree.children.length > 0) {
    result += ` (${tree.children.length} shrinks)`;
  }

  result += '\n';

  // Stop if we've reached max depth
  if (depth >= options.maxDepth) {
    if (tree.children.length > 0) {
      result += `${prefix}  ... (${tree.children.length} more children at depth ${depth + 1})\n`;
    }
    return result;
  }

  // Render children
  const childrenToShow = Math.min(tree.children.length, options.maxChildren);

  for (let i = 0; i < childrenToShow; i++) {
    const child = tree.children[i];
    const isLast =
      i === childrenToShow - 1 && childrenToShow === tree.children.length;
    const childPrefix = prefix + (isLast ? '└── ' : '├── ');
    const nextPrefix = prefix + (isLast ? '    ' : '│   ');

    if (options.showIndices) {
      result += `${prefix}${isLast ? '└' : '├'}─[${i}]─ `;
      result += renderTreeRecursive(
        child,
        options,
        depth + 1,
        nextPrefix
      ).slice(prefix.length + 6);
    } else {
      result += renderTreeRecursive(child, options, depth + 1, childPrefix);
    }
  }

  // Show how many children were omitted
  if (tree.children.length > options.maxChildren) {
    const omitted = tree.children.length - options.maxChildren;
    result += `${prefix}    ... (${omitted} more children)\n`;
  }

  return result;
}

/**
 * Render tree in compact horizontal format.
 */
export function renderTreeCompact<T>(
  tree: Tree<T>,
  maxDepth: number = 3
): string {
  return renderTreeCompactRecursive(tree, maxDepth, 0);
}

function renderTreeCompactRecursive<T>(
  tree: Tree<T>,
  maxDepth: number,
  depth: number
): string {
  if (depth >= maxDepth) {
    return `${tree.value}(...)`;
  }

  if (tree.children.length === 0) {
    return String(tree.value);
  }

  const childrenStr = tree.children
    .slice(0, 3) // Only show first 3 children
    .map((child) => renderTreeCompactRecursive(child, maxDepth, depth + 1))
    .join(', ');

  const more = tree.children.length > 3 ? ', ...' : '';

  return `${tree.value}[${childrenStr}${more}]`;
}

/**
 * Get tree statistics for debugging.
 */
export function getTreeStats<T>(tree: Tree<T>): TreeStats {
  return getTreeStatsRecursive(tree, 0);
}

export interface TreeStats {
  totalNodes: number;
  maxDepth: number;
  totalLeaves: number;
  avgBranchingFactor: number;
}

function getTreeStatsRecursive<T>(tree: Tree<T>, depth: number): TreeStats {
  let totalNodes = 1;
  let maxDepth = depth + 1;
  let totalLeaves = tree.children.length === 0 ? 1 : 0;
  let totalBranchingFactors = tree.children.length;

  for (const child of tree.children) {
    const childStats = getTreeStatsRecursive(child, depth + 1);
    totalNodes += childStats.totalNodes;
    maxDepth = Math.max(maxDepth, childStats.maxDepth);
    totalLeaves += childStats.totalLeaves;
    totalBranchingFactors +=
      childStats.totalNodes * childStats.avgBranchingFactor;
  }

  return {
    totalNodes,
    maxDepth,
    totalLeaves,
    avgBranchingFactor: totalNodes > 1 ? totalBranchingFactors / totalNodes : 0,
  };
}

/**
 * Find the path to a specific value in the tree.
 */
export function findPath<T>(tree: Tree<T>, target: T): T[] | null {
  if (tree.value === target) {
    return [tree.value];
  }

  for (const child of tree.children) {
    const childPath = findPath(child, target);
    if (childPath !== null) {
      return [tree.value, ...childPath];
    }
  }

  return null;
}
