/**
 * Interleaving explorer for systematic exploration of execution orders.
 *
 * This module provides the ability to systematically explore different thread
 * scheduling orders to find race conditions that only manifest under specific
 * interleavings of operations.
 */

import { Gen } from './gen.js';
import { Config } from './config.js';
// Create a simplified result type for interleaving testing
export interface InterleavingTestResultType {
  readonly type: 'pass' | 'fail';
  readonly testsRun: number;
  readonly propertyName?: string;
  readonly counterexample?: string;
  readonly shrinksPerformed?: number;
  readonly assertionType?: string;
  readonly shrinkSteps?: unknown[];
}
import { Size } from './data/size.js';
import { Seed } from './data/seed.js';
import { getWorkerLikePool } from './worker.js';

/**
 * Configuration for interleaving exploration.
 */
export interface InterleavingConfig {
  /** Number of concurrent operations to interleave */
  readonly operationCount: number;
  /** Maximum number of interleavings to explore per test input */
  readonly maxInterleavings: number;
  /** Strategy for selecting which interleavings to explore */
  readonly explorationStrategy: ExplorationStrategy;
  /** Whether to prioritize interleavings that are more likely to find bugs */
  readonly prioritizeSuspiciousInterleavings: boolean;
  /** Timeout for each interleaving execution (milliseconds) */
  readonly executionTimeout: number;
}

/**
 * Strategies for selecting interleavings to explore.
 */
export type ExplorationStrategy =
  /** Explore all possible interleavings (exhaustive but expensive) */
  | 'exhaustive'
  /** Randomly sample interleavings */
  | 'random'
  /** Use heuristics to prioritize interleavings likely to find bugs */
  | 'heuristic'
  /** Explore interleavings systematically with bounded depth */
  | 'bounded';

/**
 * Default interleaving exploration configuration.
 */
export function defaultInterleavingConfig(): InterleavingConfig {
  return {
    operationCount: 3,
    maxInterleavings: 20,
    explorationStrategy: 'heuristic',
    prioritizeSuspiciousInterleavings: true,
    executionTimeout: 15000, // Extended for CI
  };
}

/**
 * Represents a specific interleaving of operations.
 */
export interface Interleaving {
  /** Unique identifier for this interleaving */
  readonly id: string;
  /** Sequence of operation indices */
  readonly sequence: readonly number[];
  /** Operations involved in this interleaving */
  readonly operations: readonly InterleavingOperation[];
  /** Estimated likelihood of finding bugs with this interleaving */
  readonly bugFindingPriority: number;
}

/**
 * An operation that can be interleaved with others.
 */
export interface InterleavingOperation {
  /** Unique identifier for this operation */
  readonly id: string;
  /** Human-readable description of the operation */
  readonly description: string;
  /** Function to execute for this operation */
  readonly execute: (input: unknown) => unknown | Promise<unknown>;
  /** Dependencies that must execute before this operation */
  readonly dependencies: readonly string[];
  /** Whether this operation is likely to cause race conditions */
  readonly riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Result of executing a specific interleaving.
 */
export interface InterleavingExecutionResult {
  /** The interleaving that was executed */
  readonly interleaving: Interleaving;
  /** Whether the execution was successful */
  readonly success: boolean;
  /** Test result if successful */
  readonly testResult?: InterleavingTestResultType;
  /** Error message if execution failed */
  readonly error?: string;
  /** Execution time in milliseconds */
  readonly executionTime: number;
  /** Operations that were actually executed */
  readonly executedOperations: readonly string[];
  /** Any race conditions detected during execution */
  readonly raceConditionsDetected: readonly RaceConditionEvidence[];
}

/**
 * Evidence of a race condition detected during interleaving execution.
 */
export interface RaceConditionEvidence {
  /** Description of the race condition */
  readonly description: string;
  /** Operations involved in the race condition */
  readonly involvedOperations: readonly string[];
  /** Timing information about when the race occurred */
  readonly timing: {
    readonly startTime: number;
    readonly endTime: number;
    readonly duration: number;
  };
  /** Severity of the race condition */
  readonly severity: 'low' | 'medium' | 'high';
}

/**
 * Result of exploring interleavings for a single test input.
 */
export interface InterleavingTestResult {
  /** The test input that was explored */
  readonly input: unknown;
  /** Total number of interleavings explored */
  readonly interleavingsExplored: number;
  /** Number of interleavings that failed */
  readonly failedInterleavings: number;
  /** Whether this input showed deterministic behavior across interleavings */
  readonly deterministic: boolean;
  /** Individual interleaving execution results */
  readonly executionResults: readonly InterleavingExecutionResult[];
  /** Patterns of failure across different interleavings */
  readonly failingPatterns: readonly InterleavingFailurePattern[];
  /** Race conditions detected across all interleavings */
  readonly raceConditionsDetected: number;
}

/**
 * Pattern of failures across interleavings.
 */
export interface InterleavingFailurePattern {
  /** Description of the failure pattern */
  readonly description: string;
  /** Operations that are commonly involved in failures */
  readonly commonOperations: readonly string[];
  /** Interleavings that exhibit this pattern */
  readonly affectedInterleavings: readonly string[];
  /** How frequently this pattern occurs */
  readonly frequency: number;
  /** Sequence characteristics that trigger this pattern */
  readonly triggeringCharacteristics: readonly string[];
}

/**
 * Overall result of interleaving exploration.
 */
export interface InterleavingExplorationResult {
  /** Summary statistics */
  readonly summary: InterleavingExplorationSummary;
  /** Results for individual test inputs */
  readonly testResults: readonly InterleavingTestResult[];
  /** Global patterns found across all inputs */
  readonly globalPatterns: readonly InterleavingFailurePattern[];
  /** Recommendations for improving concurrency safety */
  readonly recommendations: readonly string[];
}

/**
 * Summary of interleaving exploration results.
 */
export interface InterleavingExplorationSummary {
  /** Total number of test inputs explored */
  readonly totalInputs: number;
  /** Total number of interleavings executed */
  readonly totalInterleavings: number;
  /** Number of inputs that showed non-deterministic behavior */
  readonly nonDeterministicInputs: number;
  /** Total race conditions detected */
  readonly totalRaceConditions: number;
  /** Average number of interleavings explored per input */
  readonly averageInterleavingsPerInput: number;
  /** Proportion of interleavings that failed */
  readonly failureRate: number;
}

/**
 * Explores different interleavings of concurrent operations.
 */
export class InterleavingExplorer<T> {
  constructor(
    /** Generator for test inputs */
    public readonly generator: Gen<T>,
    /** Operations to interleave */
    public readonly operations: readonly InterleavingOperation[],
    /** Configuration for exploration */
    public readonly config: InterleavingConfig,
    /** Variable name for debugging */
    public readonly variableName?: string,
  ) {}

  /**
   * Set a variable name for debugging.
   */
  withVariableName(name: string): InterleavingExplorer<T> {
    return new InterleavingExplorer(
      this.generator,
      this.operations,
      this.config,
      name,
    );
  }

  /**
   * Explore interleavings for the given test configuration.
   */
  async explore(testConfig: Config): Promise<InterleavingExplorationResult> {
    const workerPool = getWorkerLikePool();
    await workerPool.initialize();

    try {
      // Generate test inputs
      const testInputs = this.generateTestInputs(testConfig);

      // Explore interleavings for each input
      const testResults: InterleavingTestResult[] = [];

      for (const input of testInputs) {
        const testResult = await this.exploreInputInterleavings(input);
        testResults.push(testResult);
      }

      // Analyze results
      const summary = this.analyzeSummary(testResults);
      const globalPatterns = this.analyzeGlobalPatterns(testResults);
      const recommendations = this.generateRecommendations(testResults, globalPatterns);

      return {
        summary,
        testResults,
        globalPatterns,
        recommendations,
      };
    } catch (error) {
      throw new Error(`Interleaving exploration failed: ${error}`);
    }
  }

  /**
   * Generate test inputs for exploration.
   */
  private generateTestInputs(config: Config): T[] {
    const inputs: T[] = [];
    let seed = Seed.random();

    for (let i = 0; i < config.testLimit; i++) {
      const size = Size.of(Math.floor((i / config.testLimit) * config.sizeLimit));
      const [testSeed, nextSeed] = seed.split();
      seed = nextSeed;

      const tree = this.generator.generate(size, testSeed);
      inputs.push(tree.value);
    }

    return inputs;
  }

  /**
   * Explore interleavings for a single test input.
   */
  private async exploreInputInterleavings(input: T): Promise<InterleavingTestResult> {
    // Generate interleavings to explore
    const interleavings = this.generateInterleavings();

    // Execute each interleaving
    const executionResults: InterleavingExecutionResult[] = [];

    for (const interleaving of interleavings) {
      const result = await this.executeInterleaving(interleaving, input);
      executionResults.push(result);
    }

    // Analyze results for this input
    const failedInterleavings = executionResults.filter(r => !r.success).length;
    const deterministic = this.checkDeterminism(executionResults);
    const failingPatterns = this.analyzeFailingPatterns(executionResults);
    const raceConditionsDetected = executionResults.reduce(
      (sum, r) => sum + r.raceConditionsDetected.length, 0
    );

    return {
      input,
      interleavingsExplored: interleavings.length,
      failedInterleavings,
      deterministic,
      executionResults,
      failingPatterns,
      raceConditionsDetected,
    };
  }

  /**
   * Generate interleavings to explore based on configuration.
   */
  private generateInterleavings(): Interleaving[] {
    const operationCount = Math.min(this.config.operationCount, this.operations.length);
    const operations = this.operations.slice(0, operationCount);

    switch (this.config.explorationStrategy) {
      case 'exhaustive':
        return this.generateExhaustiveInterleavings(operations);
      case 'random':
        return this.generateRandomInterleavings(operations);
      case 'heuristic':
        return this.generateHeuristicInterleavings(operations);
      case 'bounded':
        return this.generateBoundedInterleavings(operations);
      default:
        throw new Error(`Unknown exploration strategy: ${this.config.explorationStrategy}`);
    }
  }

  /**
   * Generate all possible interleavings (exhaustive).
   */
  private generateExhaustiveInterleavings(operations: readonly InterleavingOperation[]): Interleaving[] {
    const interleavings: Interleaving[] = [];
    const operationIndices = Array.from({ length: operations.length }, (_, i) => i);

    // Generate all permutations
    const permutations = this.generatePermutations(operationIndices);

    for (let i = 0; i < Math.min(permutations.length, this.config.maxInterleavings); i++) {
      const sequence = permutations[i];
      interleavings.push({
        id: `exhaustive_${i}`,
        sequence,
        operations,
        bugFindingPriority: this.calculateBugFindingPriority(sequence, operations),
      });
    }

    return interleavings;
  }

  /**
   * Generate random interleavings.
   */
  private generateRandomInterleavings(operations: readonly InterleavingOperation[]): Interleaving[] {
    const interleavings: Interleaving[] = [];
    const operationIndices = Array.from({ length: operations.length }, (_, i) => i);

    for (let i = 0; i < this.config.maxInterleavings; i++) {
      const sequence = this.shuffleArray([...operationIndices]);
      interleavings.push({
        id: `random_${i}`,
        sequence,
        operations,
        bugFindingPriority: this.calculateBugFindingPriority(sequence, operations),
      });
    }

    return interleavings;
  }

  /**
   * Generate interleavings using heuristics to prioritize bug-finding.
   */
  private generateHeuristicInterleavings(operations: readonly InterleavingOperation[]): Interleaving[] {
    const interleavings: Interleaving[] = [];

    // Generate a mix of strategic interleavings
    const strategies = [
      () => this.generateHighRiskFirstInterleaving(operations),
      () => this.generateHighRiskLastInterleaving(operations),
      () => this.generateAlternatingRiskInterleaving(operations),
      () => this.generateDependencyViolatingInterleaving(operations),
    ];

    for (let i = 0; i < this.config.maxInterleavings; i++) {
      const strategy = strategies[i % strategies.length];
      const sequence = strategy();

      interleavings.push({
        id: `heuristic_${i}`,
        sequence,
        operations,
        bugFindingPriority: this.calculateBugFindingPriority(sequence, operations),
      });
    }

    // Sort by bug-finding priority if enabled
    if (this.config.prioritizeSuspiciousInterleavings) {
      interleavings.sort((a, b) => b.bugFindingPriority - a.bugFindingPriority);
    }

    return interleavings;
  }

  /**
   * Generate bounded interleavings with systematic coverage.
   */
  private generateBoundedInterleavings(operations: readonly InterleavingOperation[]): Interleaving[] {
    const interleavings: Interleaving[] = [];
    const operationIndices = Array.from({ length: operations.length }, (_, i) => i);

    // Generate systematic bounded interleavings
    for (let depth = 1; depth <= Math.min(operations.length, 4); depth++) {
      const bounded = this.generateBoundedPermutations(operationIndices, depth);

      for (let i = 0; i < Math.min(bounded.length, Math.floor(this.config.maxInterleavings / 4)); i++) {
        const sequence = bounded[i];
        interleavings.push({
          id: `bounded_${depth}_${i}`,
          sequence,
          operations,
          bugFindingPriority: this.calculateBugFindingPriority(sequence, operations),
        });
      }
    }

    return interleavings.slice(0, this.config.maxInterleavings);
  }

  /**
   * Execute a specific interleaving.
   */
  private async executeInterleaving(
    interleaving: Interleaving,
    input: T
  ): Promise<InterleavingExecutionResult> {
    const startTime = performance.now();
    const executedOperations: string[] = [];
    const raceConditionsDetected: RaceConditionEvidence[] = [];

    try {
      // Execute operations in the specified order
      for (const operationIndex of interleaving.sequence) {
        const operation = interleaving.operations[operationIndex];

        // Check dependencies
        const dependenciesMet = operation.dependencies.every(dep =>
          executedOperations.includes(dep)
        );

        if (!dependenciesMet) {
          // Dependency violation - this might reveal race conditions
          raceConditionsDetected.push({
            description: `Dependency violation: ${operation.id} executed before dependencies`,
            involvedOperations: [operation.id, ...operation.dependencies],
            timing: {
              startTime: performance.now(),
              endTime: performance.now(),
              duration: 0,
            },
            severity: 'high',
          });
        }

        // Execute the operation
        const operationStartTime = performance.now();

        try {
          await operation.execute(input);
          executedOperations.push(operation.id);
        } catch (error) {
          // Operation failed
          const executionTime = performance.now() - startTime;
          return {
            interleaving,
            success: false,
            error: `Operation ${operation.id} failed: ${error}`,
            executionTime,
            executedOperations,
            raceConditionsDetected,
          };
        }

        const operationEndTime = performance.now();

        // Detect potential race conditions based on timing
        if (operation.riskLevel === 'high' && (operationEndTime - operationStartTime) > 100) {
          raceConditionsDetected.push({
            description: `Slow execution of high-risk operation ${operation.id}`,
            involvedOperations: [operation.id],
            timing: {
              startTime: operationStartTime,
              endTime: operationEndTime,
              duration: operationEndTime - operationStartTime,
            },
            severity: 'medium',
          });
        }
      }

      const executionTime = performance.now() - startTime;

      // Successful execution
      const testResult: InterleavingTestResultType = {
        type: 'pass',
        testsRun: 1,
        ...(this.variableName ? { propertyName: this.variableName } : {}),
      };

      return {
        interleaving,
        success: true,
        testResult,
        executionTime,
        executedOperations,
        raceConditionsDetected,
      };

    } catch (error) {
      const executionTime = performance.now() - startTime;
      return {
        interleaving,
        success: false,
        error: String(error),
        executionTime,
        executedOperations,
        raceConditionsDetected,
      };
    }
  }

  /**
   * Check if results across interleavings are deterministic.
   */
  private checkDeterminism(results: InterleavingExecutionResult[]): boolean {
    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length <= 1) {
      return true;
    }

    // Check if all successful results are equivalent
    const firstResult = successfulResults[0];

    for (let i = 1; i < successfulResults.length; i++) {
      const currentResult = successfulResults[i];

      // Compare executed operations
      if (!this.arraysEqual(firstResult.executedOperations, currentResult.executedOperations)) {
        return false;
      }

      // Compare race condition counts
      if (firstResult.raceConditionsDetected.length !== currentResult.raceConditionsDetected.length) {
        return false;
      }
    }

    return true;
  }

  /**
   * Analyze patterns in failing interleavings.
   */
  private analyzeFailingPatterns(results: InterleavingExecutionResult[]): InterleavingFailurePattern[] {
    const patterns: InterleavingFailurePattern[] = [];
    const failedResults = results.filter(r => !r.success);

    if (failedResults.length === 0) {
      return patterns;
    }

    // Analyze common operations in failures
    const operationCounts = new Map<string, number>();

    for (const result of failedResults) {
      for (const op of result.executedOperations) {
        operationCounts.set(op, (operationCounts.get(op) || 0) + 1);
      }
    }

    const commonOperations = Array.from(operationCounts.entries())
      .filter(([_, count]) => count > failedResults.length * 0.5)
      .map(([op, _]) => op);

    if (commonOperations.length > 0) {
      patterns.push({
        description: 'Operations commonly present in failures',
        commonOperations,
        affectedInterleavings: failedResults.map(r => r.interleaving.id),
        frequency: failedResults.length / results.length,
        triggeringCharacteristics: ['High-risk operation execution', 'Dependency violations'],
      });
    }

    return patterns;
  }

  /**
   * Analyze summary statistics.
   */
  private analyzeSummary(testResults: InterleavingTestResult[]): InterleavingExplorationSummary {
    const totalInputs = testResults.length;
    const totalInterleavings = testResults.reduce((sum, r) => sum + r.interleavingsExplored, 0);
    const nonDeterministicInputs = testResults.filter(r => !r.deterministic).length;
    const totalRaceConditions = testResults.reduce((sum, r) => sum + r.raceConditionsDetected, 0);
    const averageInterleavingsPerInput = totalInputs > 0 ? totalInterleavings / totalInputs : 0;
    const totalFailures = testResults.reduce((sum, r) => sum + r.failedInterleavings, 0);
    const failureRate = totalInterleavings > 0 ? totalFailures / totalInterleavings : 0;

    return {
      totalInputs,
      totalInterleavings,
      nonDeterministicInputs,
      totalRaceConditions,
      averageInterleavingsPerInput,
      failureRate,
    };
  }

  /**
   * Analyze global patterns across all test results.
   */
  private analyzeGlobalPatterns(testResults: InterleavingTestResult[]): InterleavingFailurePattern[] {
    const globalPatterns: InterleavingFailurePattern[] = [];

    // Combine all failing patterns
    const allPatterns = testResults.flatMap(r => r.failingPatterns);

    if (allPatterns.length > 0) {
      // Aggregate similar patterns
      const patternGroups = new Map<string, InterleavingFailurePattern[]>();

      for (const pattern of allPatterns) {
        const key = pattern.description;
        if (!patternGroups.has(key)) {
          patternGroups.set(key, []);
        }
        patternGroups.get(key)!.push(pattern);
      }

      for (const [description, patterns] of patternGroups) {
        const aggregatedPattern: InterleavingFailurePattern = {
          description,
          commonOperations: [...new Set(patterns.flatMap(p => p.commonOperations))],
          affectedInterleavings: [...new Set(patterns.flatMap(p => p.affectedInterleavings))],
          frequency: patterns.reduce((sum, p) => sum + p.frequency, 0) / patterns.length,
          triggeringCharacteristics: [...new Set(patterns.flatMap(p => p.triggeringCharacteristics))],
        };

        globalPatterns.push(aggregatedPattern);
      }
    }

    return globalPatterns;
  }

  /**
   * Generate recommendations based on analysis.
   */
  private generateRecommendations(
    testResults: InterleavingTestResult[],
    globalPatterns: InterleavingFailurePattern[]
  ): string[] {
    const recommendations: string[] = [];

    // Analyze failure rates
    const totalInterleavings = testResults.reduce((sum, r) => sum + r.interleavingsExplored, 0);
    const totalFailures = testResults.reduce((sum, r) => sum + r.failedInterleavings, 0);
    const failureRate = totalInterleavings > 0 ? totalFailures / totalInterleavings : 0;

    if (failureRate > 0.1) {
      recommendations.push('High failure rate detected - consider reviewing synchronization mechanisms');
    }

    // Analyze race conditions
    const totalRaceConditions = testResults.reduce((sum, r) => sum + r.raceConditionsDetected, 0);

    if (totalRaceConditions > 0) {
      recommendations.push('Race conditions detected - review shared state access patterns');
    }

    // Analyze patterns
    for (const pattern of globalPatterns) {
      if (pattern.frequency > 0.2) {
        recommendations.push(`Pattern '${pattern.description}' occurs frequently - consider targeted fixes`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('No significant concurrency issues detected in tested interleavings');
    }

    return recommendations;
  }

  // Utility methods

  private generatePermutations<T>(array: T[]): T[][] {
    if (array.length <= 1) return [array];

    const result: T[][] = [];
    for (let i = 0; i < array.length; i++) {
      const rest = array.slice(0, i).concat(array.slice(i + 1));
      const restPermutations = this.generatePermutations(rest);

      for (const perm of restPermutations) {
        result.push([array[i], ...perm]);
      }
    }

    return result;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  private generateBoundedPermutations<T>(array: T[], maxDepth: number): T[][] {
    if (maxDepth <= 0 || array.length === 0) return [[]];
    if (maxDepth >= array.length) return this.generatePermutations(array);

    const result: T[][] = [];

    for (let i = 0; i < array.length; i++) {
      const rest = array.slice(0, i).concat(array.slice(i + 1));
      const subPermutations = this.generateBoundedPermutations(rest, maxDepth - 1);

      for (const subPerm of subPermutations) {
        result.push([array[i], ...subPerm]);
      }
    }

    return result;
  }

  private calculateBugFindingPriority(
    sequence: readonly number[],
    operations: readonly InterleavingOperation[]
  ): number {
    let priority = 0;

    // Higher priority for sequences with high-risk operations early
    for (let i = 0; i < sequence.length; i++) {
      const operation = operations[sequence[i]];
      if (operation.riskLevel === 'high') {
        priority += (sequence.length - i) * 2;
      } else if (operation.riskLevel === 'medium') {
        priority += (sequence.length - i);
      }
    }

    // Higher priority for dependency violations
    for (let i = 0; i < sequence.length; i++) {
      const operation = operations[sequence[i]];
      const executedBefore = sequence.slice(0, i).map(idx => operations[idx].id);

      for (const dep of operation.dependencies) {
        if (!executedBefore.includes(dep)) {
          priority += 5; // Dependency violation is high priority
        }
      }
    }

    return priority;
  }

  private generateHighRiskFirstInterleaving(operations: readonly InterleavingOperation[]): number[] {
    const indices = Array.from({ length: operations.length }, (_, i) => i);
    return indices.sort((a, b) => {
      const riskA = operations[a].riskLevel;
      const riskB = operations[b].riskLevel;
      const riskOrder = { high: 3, medium: 2, low: 1 };
      return riskOrder[riskB] - riskOrder[riskA];
    });
  }

  private generateHighRiskLastInterleaving(operations: readonly InterleavingOperation[]): number[] {
    const indices = Array.from({ length: operations.length }, (_, i) => i);
    return indices.sort((a, b) => {
      const riskA = operations[a].riskLevel;
      const riskB = operations[b].riskLevel;
      const riskOrder = { high: 3, medium: 2, low: 1 };
      return riskOrder[riskA] - riskOrder[riskB];
    });
  }

  private generateAlternatingRiskInterleaving(operations: readonly InterleavingOperation[]): number[] {
    const high = operations.map((op, i) => ({ op, i })).filter(x => x.op.riskLevel === 'high');
    const other = operations.map((op, i) => ({ op, i })).filter(x => x.op.riskLevel !== 'high');

    const result: number[] = [];
    const maxLength = Math.max(high.length, other.length);

    for (let i = 0; i < maxLength; i++) {
      if (i < high.length) result.push(high[i].i);
      if (i < other.length) result.push(other[i].i);
    }

    return result;
  }

  private generateDependencyViolatingInterleaving(operations: readonly InterleavingOperation[]): number[] {
    const indices = Array.from({ length: operations.length }, (_, i) => i);

    // Try to put operations before their dependencies
    return indices.sort((a, b) => {
      const opA = operations[a];
      const opB = operations[b];

      // If A depends on B, put A first (violating dependency)
      if (opA.dependencies.includes(opB.id)) return -1;
      if (opB.dependencies.includes(opA.id)) return 1;

      return 0;
    });
  }

  private arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}

/**
 * Create an interleaving explorer with a test function.
 */
export function interleavingExplorer<T>(
  generator: Gen<T>,
  testFunction: (input: T) => boolean | Promise<boolean>,
  config: Partial<InterleavingConfig> = {}
): InterleavingExplorer<T> {
  // Convert test function to operations
  const operations: InterleavingOperation[] = [
    {
      id: 'test_operation',
      description: 'Execute test function',
      execute: async (input: unknown) => {
        const result = await testFunction(input as T);
        if (!result) {
          throw new Error('Test function returned false');
        }
        return result;
      },
      dependencies: [],
      riskLevel: 'medium',
    },
  ];

  const fullConfig: InterleavingConfig = {
    ...defaultInterleavingConfig(),
    ...config,
  };

  return new InterleavingExplorer(generator, operations, fullConfig);
}

/**
 * Create an interleaving explorer with multiple operations.
 */
export function interleavingExplorerWithOperations<T>(
  generator: Gen<T>,
  operations: InterleavingOperation[],
  config: Partial<InterleavingConfig> = {}
): InterleavingExplorer<T> {
  const fullConfig: InterleavingConfig = {
    ...defaultInterleavingConfig(),
    ...config,
  };

  return new InterleavingExplorer(generator, operations, fullConfig);
}
