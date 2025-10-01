/**
 * Abstract worker pool interface for property-based testing.
 *
 * Provides a unified interface for managing worker threads or processes
 * that execute test functions in isolation, enabling concurrent property testing.
 */

/**
 * Configuration for worker-like behavior.
 */
export interface WorkerLikePoolConfig {
  /** Maximum number of workers to create */
  readonly maxWorkers: number;

  /** Timeout for individual test execution in milliseconds */
  readonly testTimeout: number;

  /** Maximum number of pending tests before rejecting new ones */
  readonly maxPendingTests: number;

  /** Timeout for health checks in milliseconds */
  readonly healthCheckTimeout: number;

  /** Enable debug logging */
  readonly enableLogging: boolean;
}

/**
 * Default configuration for worker pools.
 */
export function defaultWorkerLikePoolConfig(): WorkerLikePoolConfig {
  return {
    maxWorkers: Math.max(1, Math.floor((globalThis.navigator?.hardwareConcurrency || 4) / 2)),
    testTimeout: 30000, // 30 seconds
    maxPendingTests: 100,
    healthCheckTimeout: 5000, // 5 seconds
    enableLogging: false,
  };
}

/**
 * Interface for individual workers within the pool.
 */
export interface WorkerLike {
  /** Unique identifier for this worker */
  readonly id: string;

  /** Execute a test function with the given input */
  executeTest<TInput, TResult>(
    testId: string | number,
    input: TInput,
    testFunction: (input: TInput) => TResult | Promise<TResult>
  ): Promise<TestExecutionResult<TResult>>;

  /** Check if the worker is responsive */
  ping(): Promise<boolean>;

  /** Terminate the worker cleanly */
  terminate(): Promise<void>;

  /** Check if the worker has been terminated */
  isTerminated(): boolean;
}

/**
 * Result of test execution from a worker.
 */
export interface TestExecutionResult<TResult> {
  /** Whether the test completed successfully */
  readonly success: boolean;
  /** Test result if successful */
  readonly result?: TResult;
  /** Error message if failed */
  readonly error?: string;
  /** Time taken to execute in milliseconds */
  readonly timing: number;
  /** ID of the worker that executed the test */
  readonly workerId?: string;
}

/**
 * Basic information about the worker pool.
 */
export interface PoolStatus {
  /** Total number of workers */
  readonly totalWorkers: number;
  /** Number of pending tests */
  readonly pendingTests: number;
  /** Number of healthy workers (simplified - same as totalWorkers) */
  readonly healthyWorkers: number;
  /** Whether the pool is healthy (simplified - always true if workers exist) */
  readonly isHealthy: boolean;
  /** Total tests executed (simplified - always 0) */
  readonly totalTestsExecuted: number;
  /** Total failed tests (simplified - always 0) */
  readonly totalTestsFailed: number;
  /** Average execution time (simplified - always 0) */
  readonly averageExecutionTime: number;
  /** Active tests (alias for pendingTests) */
  readonly activeTests: number;
}

/**
 * Health status information for the worker pool.
 * @deprecated Health checking has been simplified
 */
export interface PoolHealthStatus {
  /** Total number of workers */
  readonly totalWorkers: number;
  /** Number of healthy workers */
  readonly healthyWorkers: number;
  /** Number of pending tests */
  readonly pendingTests: number;
  /** Whether the pool is healthy */
  readonly isHealthy: boolean;
}

// Worker detection and creation
function determineWorkerType(): 'node' | 'web' {
  // Check Node.js environment first
  if (typeof globalThis.process !== 'undefined' &&
      globalThis.process.versions?.node) {
    return 'node';
  }

  // Check Web Worker support
  if (typeof globalThis.Worker !== 'undefined') {
    return 'web';
  }

  // Default to Node.js (this should be caught by initialization)
  return 'node';
}

// Import types for different worker implementations
type NodeWorkerLike = import('./worker/node-worker.js').NodeWorkerLike;
type WebWorkerLike = import('./worker/web-worker.js').WebWorkerLike;

/**
 * Worker pool implementation that manages test execution across multiple workers.
 *
 * Automatically selects between Node.js worker_threads and Web Workers based on
 * the runtime environment, providing a consistent interface for concurrent testing.
 */
export class WorkerLikePool {
  private readonly config: WorkerLikePoolConfig;
  private readonly workers = new Map<string, WorkerLike>();
  private readonly pendingTests = new Map<string, Promise<any>>();
  private isInitialized = false;
  private isShuttingDown = false;
  // Removed health tracking variables
  private roundRobinCounter = 0;

  constructor(config: Partial<WorkerLikePoolConfig> = {}) {
    this.config = { ...defaultWorkerLikePoolConfig(), ...config };
  }

  /**
   * Initialize the worker pool with the configured number of workers.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const workerType = this.determineWorkerType();
    const workerCount = this.config.maxWorkers;

    if (this.config.enableLogging) {
      console.log(`Initializing worker pool with ${workerCount} ${workerType} workers`);
    }

    // Create all workers concurrently for faster startup
    const workerPromises = Array.from({ length: workerCount }, () =>
      this.createWorker(workerType)
    );

    await Promise.all(workerPromises);
    this.isInitialized = true;
  }

  /**
   * Create a single worker of the specified type.
   */
  private async createWorker(type: 'node' | 'web'): Promise<void> {
    let worker: WorkerLike;

    if (type === 'node') {
      const { NodeWorkerLike } = await import('./worker/node-worker.js');
      worker = new NodeWorkerLike(this.config) as NodeWorkerLike;
    } else {
      const { WebWorkerLike } = await import('./worker/web-worker.js');
      worker = new WebWorkerLike(this.config) as WebWorkerLike;
    }

    this.workers.set(worker.id, worker);

    if (this.config.enableLogging) {
      console.log(`Created ${type} worker: ${worker.id}`);
    }
  }

  /**
   * Determine the appropriate worker type for the current environment.
   */
  private determineWorkerType(): 'node' | 'web' {
    return determineWorkerType();
  }

  /**
   * Execute a test function in an available worker.
   */
  async executeTest<TInput, TResult>(
    input: TInput,
    testFunction: (input: TInput) => TResult | Promise<TResult>
  ): Promise<TestExecutionResult<TResult>> {
    if (!this.isInitialized) {
      throw new Error('Worker pool not initialized. Call initialize() first.');
    }

    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down. Cannot execute new tests.');
    }

    // Check resource limits
    if (this.pendingTests.size >= this.config.maxPendingTests) {
      throw new Error(`Too many pending tests (${this.pendingTests.size}). Maximum allowed: ${this.config.maxPendingTests}`);
    }

    // Find an available worker
    const availableWorker = this.getAvailableWorker();
    if (!availableWorker) {
      throw new Error('No healthy workers available');
    }

    // Generate unique test ID
    const testId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Execute the test with timeout and resource tracking
    const testPromise = this.executeWithTimeout(
      availableWorker,
      testId,
      input,
      testFunction
    );

    // Track pending test
    this.pendingTests.set(testId, testPromise);

    try {
      const result = await testPromise;
      return result;
    } finally {
      this.pendingTests.delete(testId);
    }
  }

  /**
   * Execute test with timeout and error handling.
   */
  private async executeWithTimeout<TInput, TResult>(
    worker: WorkerLike,
    testId: string,
    input: TInput,
    testFunction: (input: TInput) => TResult | Promise<TResult>
  ): Promise<TestExecutionResult<TResult>> {
    return new Promise<TestExecutionResult<TResult>>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Test execution timed out after ${this.config.testTimeout}ms`));
      }, this.config.testTimeout);

      worker.executeTest(testId, input, testFunction)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Find an available worker using round-robin distribution for load balancing.
   */
  private getAvailableWorker(): WorkerLike | null {
    const availableWorkers = Array.from(this.workers.values())
      .filter(worker => !worker.isTerminated());

    if (availableWorkers.length === 0) {
      return null;
    }

    // Use dedicated round-robin counter to ensure distribution
    const selectedWorker = availableWorkers[this.roundRobinCounter % availableWorkers.length];
    this.roundRobinCounter++;
    return selectedWorker;
  }

  // Removed health tracking methods

  /**
   * Perform health check on all workers.
   */
  async healthCheck(): Promise<PoolHealthStatus> {
    if (!this.isInitialized) {
      return {
        totalWorkers: 0,
        healthyWorkers: 0,
        pendingTests: 0,
        isHealthy: false,
      };
    }

    if (this.config.enableLogging) {
      console.log('Performing health check on worker pool');
    }

    // Check all workers concurrently with timeout
    const healthCheckPromises = Array.from(this.workers.values()).map(worker =>
      this.checkWorkerHealth(worker)
    );

    await Promise.allSettled(healthCheckPromises);

    const healthyWorkers = Array.from(this.workers.values())
      .filter(worker => !worker.isTerminated()).length;

    const status: PoolHealthStatus = {
      totalWorkers: this.workers.size,
      healthyWorkers,
      pendingTests: this.pendingTests.size,
      isHealthy: healthyWorkers > 0 && !this.isShuttingDown,
    };

    if (this.config.enableLogging) {
      console.log(`Health check complete: ${healthyWorkers}/${this.workers.size} workers healthy, ${this.pendingTests.size} pending tests`);
    }

    return status;
  }

  /**
   * Check health of a single worker.
   */
  private async checkWorkerHealth(worker: WorkerLike): Promise<void> {
    try {
      const isHealthy = await worker.ping();
      if (!isHealthy) {
        this.markWorkerUnhealthy(worker.id);
      }
    } catch (_error) {
      this.markWorkerUnhealthy(worker.id);
    }
  }

  /**
   * Mark a worker as unhealthy and schedule replacement.
   */
  private markWorkerUnhealthy(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    if (this.config.enableLogging) {
      console.log(`Worker ${workerId} marked as unhealthy, scheduling replacement`);
    }

    // Remove the unhealthy worker
    this.workers.delete(workerId);

    // Schedule replacement (don't await to avoid blocking)
    this.replaceWorker(workerId, worker);
  }

  /**
   * Replace an unhealthy worker with a new one.
   */
  private async replaceWorker(workerId: string, oldWorker: WorkerLike): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    try {
      // Terminate the old worker
      try {
        await oldWorker.terminate();
      } catch (_error) {
        // Ignore termination errors
      }

      // Create a new worker of the same type
      const workerType = this.determineWorkerType();
      await this.createWorker(workerType);

      if (this.config.enableLogging) {
        console.log(`Replaced worker ${workerId} with new ${workerType} worker`);
      }
    } catch (error) {
      if (this.config.enableLogging) {
        console.log(`Failed to replace worker ${workerId}:`, error);
      }
    }
  }

  /**
   * Get current pool statistics.
   */
  getStatus(): PoolStatus {
    return {
      totalWorkers: this.workers.size,
      pendingTests: this.pendingTests.size,
      healthyWorkers: this.workers.size, // Simplified
      isHealthy: this.workers.size > 0 && !this.isShuttingDown,
      totalTestsExecuted: 0, // Simplified
      totalTestsFailed: 0, // Simplified
      averageExecutionTime: 0, // Simplified
      activeTests: this.pendingTests.size,
    };
  }

  /**
   * Legacy method for backward compatibility.
   * @deprecated Use getStatus() instead
   */
  getStats(): PoolStatus {
    return this.getStatus();
  }


  /**
   * Shutdown the worker pool and clean up all resources.
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    if (this.config.enableLogging) {
      console.log('Shutting down worker pool');
    }

    // Terminate all workers (which will reject their internal pending tests)
    const terminatePromises = Array.from(this.workers.values()).map(worker =>
      worker.terminate().catch(() => {
        // Ignore individual termination errors during shutdown
      })
    );

    await Promise.allSettled(terminatePromises);

    // Clear all tracking data - pending tests should have been rejected by workers
    this.workers.clear();
    this.pendingTests.clear();
    this.isInitialized = false;

    if (this.config.enableLogging) {
      console.log('Worker pool shutdown complete');
    }
  }
}

/**
 * Message types for worker communication protocol.
 */
export type WorkerMessage =
  | { type: 'execute-test'; testId: string; input: any; serializedFunction: any }
  | { type: 'health-check'; healthCheckId: string }
  | { type: 'result'; testId: string; result: any; timing: number }
  | { type: 'error'; testId: string; error: string }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'terminate' };

/**
 * Global worker pool instance for singleton access.
 */
let globalWorkerPool: WorkerLikePool | null = null;

/**
 * Get the global worker pool instance, creating it if necessary.
 */
export function getWorkerLikePool(): WorkerLikePool {
  if (!globalWorkerPool) {
    globalWorkerPool = new WorkerLikePool();
  }
  return globalWorkerPool;
}

/**
 * Shutdown the global worker pool and clear the reference.
 */
export async function shutdownWorkerLikePool(): Promise<void> {
  if (globalWorkerPool) {
    await globalWorkerPool.shutdown();
    globalWorkerPool = null;
  }
}

// Re-export TestResult type from worker implementations
export type { TestResult } from './worker/node-worker.js';
