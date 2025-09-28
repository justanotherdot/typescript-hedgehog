/**
 * WorkerLike management layer for concurrent property-based testing.
 *
 * @experimental This API is experimental and may change in future releases.
 * Use at your own risk in production environments.
 *
 * Abstracts Web WorkerLikes (browser) and worker_threads (Node.js) into a unified interface
 * for executing test functions in parallel with proper lifecycle management.
 */

// Type declarations for browser globals
declare const navigator: { hardwareConcurrency?: number } | undefined;
declare const Worker: {
  new (url: string): WorkerLike;
} | undefined;

// Worker type that works across environments
interface WorkerLike {
  postMessage(message: unknown): void;
  terminate?(): void;
  addEventListener?(type: string, listener: (event: MessageEvent) => void): void;
  removeEventListener?(type: string, listener: (event: MessageEvent) => void): void;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
  onmessage?: ((event: { data: WorkerLikeMessage }) => void) | null;
}

/**
 * Message types for worker communication protocol.
 */
export type WorkerLikeMessage =
  | { type: 'execute-test'; testId: string; input: unknown; functionCode: string }
  | { type: 'test-result'; testId: string; result: TestResult; timing: number }
  | { type: 'error'; testId: string; error: string }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'terminate' };

/**
 * Test result structure (simplified for worker communication).
 */
export interface TestResult {
  readonly type: 'pass' | 'fail' | 'discard';
  readonly testsRun: number;
  readonly counterexample?: string;
  readonly shrinksPerformed?: number;
  readonly propertyName?: string;
  readonly assertionType?: string;
  readonly shrinkSteps?: unknown[];
}

/**
 * Configuration for worker pool management.
 */
export interface WorkerLikePoolConfig {
  /** Maximum number of workers to maintain */
  readonly maxWorkers: number;
  /** Timeout for individual test execution (ms) */
  readonly testTimeout: number;
  /** Timeout for worker ping/pong health checks (ms) */
  readonly healthCheckTimeout: number;
  /** Whether to enable detailed logging */
  readonly enableLogging: boolean;
}

/**
 * Default worker pool configuration.
 */
export function defaultWorkerLikePoolConfig(): WorkerLikePoolConfig {
  // Use navigator.hardwareConcurrency for browser, reasonable default for Node.js
  let maxWorkers = 4;
  try {
    // eslint-disable-next-line no-undef
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      // Browser environment
      // eslint-disable-next-line no-undef
      maxWorkers = navigator.hardwareConcurrency;
    } else if (typeof process !== 'undefined' && process.versions?.node) {
      // Node.js environment - use a reasonable default since we can't use async here
      // Most servers have at least 2-4 cores, so 4 is a safe default
      maxWorkers = 4;
    }
  } catch {
    // Fallback if any environment detection fails
    maxWorkers = 4;
  }

  return {
    maxWorkers: Math.max(1, maxWorkers),
    testTimeout: 10000, // 10 seconds
    healthCheckTimeout: 5000, // 5 seconds
    enableLogging: false,
  };
}

/**
 * Represents a managed worker with lifecycle tracking.
 */
export interface ManagedWorkerLike {
  readonly id: string;
  readonly worker: WorkerLike;
  readonly createdAt: number;
  readonly isHealthy: boolean;
  readonly activeTests: Set<string>;
}

/**
 * Result of executing a test on a worker.
 */
export interface WorkerLikeTestResult {
  readonly success: boolean;
  readonly result?: TestResult;
  readonly error?: string;
  readonly timing: number;
  readonly workerId: string;
}

/**
 * Pool of managed workers for parallel test execution.
 */
export class WorkerLikePool {
  private readonly workers = new Map<string, ManagedWorkerLike>();
  private readonly pendingTests = new Map<string, {
    resolve: (result: WorkerLikeTestResult) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>();
  private workerIdCounter = 0;
  private roundRobinCounter = 0;

  constructor(private readonly config: WorkerLikePoolConfig = defaultWorkerLikePoolConfig()) {}

  /**
   * Initialize the worker pool with the specified number of workers.
   */
  async initialize(): Promise<void> {
    const workerCount = Math.min(this.config.maxWorkers, 8); // Cap at 8 for safety

    if (this.config.enableLogging) {
      // eslint-disable-next-line no-console
      console.log(`Initializing worker pool with ${workerCount} workers`);
    }

    const initPromises = Array.from({ length: workerCount }, () => this.createWorkerLike());
    await Promise.all(initPromises);
  }

  /**
   * Execute a test function on an available worker.
   */
  async executeTest(
    input: unknown,
    testFunction: (input: unknown) => TestResult | Promise<TestResult>
  ): Promise<WorkerLikeTestResult> {
    const testId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const worker = await this.getAvailableWorkerLike();

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingTests.delete(testId);
        this.markWorkerLikeUnhealthy(worker.id);
        reject(new Error(`Test ${testId} timed out after ${this.config.testTimeout}ms`));
      }, this.config.testTimeout);

      // Register pending test
      this.pendingTests.set(testId, { resolve, reject, timeoutId });

      // Send test to worker
      const functionCode = testFunction.toString();
      const message: WorkerLikeMessage = {
        type: 'execute-test',
        testId,
        input,
        functionCode,
      };


      this.sendToWorkerLike(worker, message);
      worker.activeTests.add(testId);
    });
  }

  /**
   * Check health of all workers and replace unhealthy ones.
   */
  async healthCheck(): Promise<void> {
    const healthPromises = Array.from(this.workers.values()).map(worker =>
      this.checkWorkerLikeHealth(worker)
    );

    await Promise.all(healthPromises);
  }

  /**
   * Shutdown all workers and clean up resources.
   */
  async shutdown(): Promise<void> {
    if (this.config.enableLogging) {
      // eslint-disable-next-line no-console
      console.log('Shutting down worker pool');
    }

    // Cancel all pending tests
    for (const [testId, { reject, timeoutId }] of this.pendingTests) {
      clearTimeout(timeoutId);
      reject(new Error(`Test ${testId} cancelled due to shutdown`));
    }
    this.pendingTests.clear();

    // Terminate all workers
    const terminatePromises = Array.from(this.workers.values()).map(worker =>
      this.terminateWorkerLike(worker)
    );

    await Promise.all(terminatePromises);
    this.workers.clear();
  }

  /**
   * Get current pool statistics.
   */
  getStats(): {
    totalWorkers: number;
    healthyWorkers: number;
    activeTests: number;
    pendingTests: number;
  } {
    const healthyWorkers = Array.from(this.workers.values()).filter(w => w.isHealthy).length;
    const activeTests = Array.from(this.workers.values()).reduce(
      (sum, worker) => sum + worker.activeTests.size, 0
    );

    return {
      totalWorkers: this.workers.size,
      healthyWorkers,
      activeTests,
      pendingTests: this.pendingTests.size,
    };
  }

  /**
   * Create a new worker and set up message handling.
   */
  private async createWorkerLike(): Promise<ManagedWorkerLike> {
    const workerId = `worker_${++this.workerIdCounter}`;

    try {
      const worker = await this.createWorkerLikeInstance();

      const managedWorkerLike: ManagedWorkerLike = {
        id: workerId,
        worker,
        createdAt: Date.now(),
        isHealthy: true,
        activeTests: new Set(),
      };

      this.setupWorkerLikeMessageHandling(managedWorkerLike);
      this.workers.set(workerId, managedWorkerLike);

      if (this.config.enableLogging) {
        // eslint-disable-next-line no-console
        console.log(`Created worker ${workerId}`);
      }

      return managedWorkerLike;
    } catch (error) {
      throw new Error(`Failed to create worker ${workerId}: ${error}`);
    }
  }

  /**
   * Create a worker instance appropriate for the current environment.
   */
  private async createWorkerLikeInstance(): Promise<WorkerLike | any> {
    // Detect environment and create appropriate worker
    // In test environment, use mock worker to handle closures properly
    const isTest = typeof process !== 'undefined' && (
      process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true' ||
      process.argv.some(arg => arg.includes('vitest'))
    );

    if (isTest) {
      // For testing, fall back to Node.js worker_threads since mock has TypeScript issues
      return this.createNodeWorkerLike();
    // eslint-disable-next-line no-undef
    } else if (typeof Worker !== 'undefined') {
      // Browser environment - use Web Workers
      return this.createWebWorkerLike();
    } else if (typeof require !== 'undefined') {
      // Node.js environment - use worker_threads
      return this.createNodeWorkerLike();
    } else {
      // Fallback to Node.js worker_threads for unsupported environments
      return this.createNodeWorkerLike();
    }
  }


  /**
   * Create a Web WorkerLike for browser environment.
   */
  private createWebWorkerLike(): WorkerLike {
    // Create inline worker with test execution logic
    const workerScript = `
      self.onmessage = function(event) {
        const message = event.data;

        if (message.type === 'execute-test') {
          executeTest(message);
        } else if (message.type === 'ping') {
          self.postMessage({ type: 'pong' });
        } else if (message.type === 'terminate') {
          self.close();
        }
      };

      async function executeTest(message) {
        const { testId, input, functionCode } = message;
        const startTime = performance.now();

        try {
          // Reconstruct function from code
          const testFunction = new Function('return ' + functionCode)();

          // Execute test function
          const result = await testFunction(input);
          const timing = performance.now() - startTime;

          self.postMessage({
            type: 'test-result',
            testId,
            result,
            timing
          });
        } catch (error) {
          const timing = performance.now() - startTime;
          self.postMessage({
            type: 'error',
            testId,
            error: error.message || String(error)
          });
        }
      }
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    // eslint-disable-next-line no-undef
    if (!Worker) {
      throw new Error('Worker is not available in this environment');
    }
    return new Worker(workerUrl);
  }

  /**
   * Create a Node.js worker_threads worker.
   */
  private createNodeWorkerLike(): any {
    // For Node.js environment, we'll use a simulated approach initially
    // In a full implementation, this would use the worker_threads module
    // const { WorkerLike } = require('worker_threads');

    // WorkerLike script as a string (in real implementation, this would be a separate file)
    /*
    const workerScript = `
      const { parentPort } = require('worker_threads');

      parentPort.on('message', async (message) => {
        if (message.type === 'execute-test') {
          await executeTest(message);
        } else if (message.type === 'ping') {
          parentPort.postMessage({ type: 'pong' });
        } else if (message.type === 'terminate') {
          process.exit(0);
        }
      });

      async function executeTest(message) {
        const { testId, input, functionCode } = message;
        const startTime = process.hrtime.bigint();

        try {
          // Reconstruct function from code
          const testFunction = new Function('return ' + functionCode)();

          // Execute test function
          const result = await testFunction(input);
          const endTime = process.hrtime.bigint();
          const timing = Number(endTime - startTime) / 1000000; // Convert to milliseconds

          parentPort.postMessage({
            type: 'test-result',
            testId,
            result,
            timing
          });
        } catch (error) {
          const endTime = process.hrtime.bigint();
          const timing = Number(endTime - startTime) / 1000000;

          parentPort.postMessage({
            type: 'error',
            testId,
            error: error.message || String(error)
          });
        }
      }
    `;
    */

    // For now, return a mock worker that simulates the behavior
    // In a full implementation, this would create an actual worker_threads WorkerLike
    return this.createMockWorkerLike();
  }

  /**
   * Create a mock worker for environments where real workers aren't available.
   * This provides a fallback that maintains the same API but runs synchronously.
   */
  private createMockWorkerLike(): any {
    const mockWorkerLike = {
      postMessage: (message: WorkerLikeMessage) => {
        // Simulate async message handling
        setTimeout(() => {
          this.handleMockWorkerLikeMessage(mockWorkerLike, message);
        }, 0);
      },
      terminate: () => {
        // Cleanup mock worker
      },
      onmessage: null as ((event: { data: WorkerLikeMessage }) => void) | null,
    };

    return mockWorkerLike;
  }

  /**
   * Handle messages for mock worker (fallback implementation).
   */
  private async handleMockWorkerLikeMessage(mockWorkerLike: any, message: WorkerLikeMessage): Promise<void> {
    if (message.type === 'execute-test') {
      const { testId, input, functionCode } = message;
      const startTime = performance.now();

      try {
        // Reconstruct and execute function
        const testFunction = new Function('return ' + functionCode)();
        const result = await testFunction(input);
        const timing = performance.now() - startTime;

        if (mockWorkerLike.onmessage) {
          mockWorkerLike.onmessage({
            data: {
              type: 'test-result',
              testId,
              result,
              timing
            }
          });
        }
      } catch (error) {
        const timing = performance.now() - startTime;
        if (mockWorkerLike.onmessage) {
          mockWorkerLike.onmessage({
            data: {
              type: 'error',
              testId,
              error: error instanceof Error ? error.message : String(error),
              timing
            }
          });
        }
      }
    } else if (message.type === 'ping') {
      if (mockWorkerLike.onmessage) {
        mockWorkerLike.onmessage({ data: { type: 'pong' } });
      }
    }
  }

  /**
   * Set up message handling for a worker.
   */
  private setupWorkerLikeMessageHandling(managedWorkerLike: ManagedWorkerLike): void {
    const messageHandler = (event: { data: WorkerLikeMessage }) => {
      const message = event.data;

      if (message.type === 'test-result') {
        this.handleTestResult(managedWorkerLike, message);
      } else if (message.type === 'error') {
        this.handleTestError(managedWorkerLike, message);
      } else if (message.type === 'pong') {
        // Health check response - worker is healthy
        if (this.config.enableLogging) {
          // eslint-disable-next-line no-console
          console.log(`WorkerLike ${managedWorkerLike.id} health check passed`);
        }
      }
    };

    if ('onmessage' in managedWorkerLike.worker) {
      managedWorkerLike.worker.onmessage = messageHandler;
    } else if ('on' in managedWorkerLike.worker) {
      managedWorkerLike.worker.on('message', (...args: unknown[]) => {
        const data = args[0] as WorkerLikeMessage;
        messageHandler({ data });
      });
    }
  }

  /**
   * Handle successful test result from worker.
   */
  private handleTestResult(
    worker: ManagedWorkerLike,
    message: { testId: string; result: TestResult; timing: number }
  ): void {
    const { testId, result, timing } = message;
    const pending = this.pendingTests.get(testId);

    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingTests.delete(testId);
      worker.activeTests.delete(testId);

      pending.resolve({
        success: true,
        result,
        timing,
        workerId: worker.id,
      });
    }
  }

  /**
   * Handle test error from worker.
   */
  private handleTestError(
    worker: ManagedWorkerLike,
    message: { testId: string; error: string }
  ): void {
    const { testId, error } = message;
    const pending = this.pendingTests.get(testId);

    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingTests.delete(testId);
      worker.activeTests.delete(testId);

      pending.resolve({
        success: false,
        error,
        timing: 0,
        workerId: worker.id,
      });
    }
  }

  /**
   * Get an available worker for test execution.
   */
  private async getAvailableWorkerLike(): Promise<ManagedWorkerLike> {
    // Find all workers with minimum active tests
    const healthyWorkers = Array.from(this.workers.values()).filter(w => w.isHealthy);

    if (healthyWorkers.length === 0) {
      // No healthy workers available - try to create or repair
      if (this.workers.size < this.config.maxWorkers) {
        return await this.createWorkerLike();
      }
      throw new Error('No healthy workers available');
    }

    const minActiveTests = Math.min(...healthyWorkers.map(w => w.activeTests.size));
    const candidateWorkers = healthyWorkers.filter(w => w.activeTests.size === minActiveTests);

    // Use round-robin selection among workers with equal minimum active tests
    const selectedWorker = candidateWorkers[this.roundRobinCounter % candidateWorkers.length];
    this.roundRobinCounter++;

    return selectedWorker;
  }

  /**
   * Send a message to a worker.
   */
  private sendToWorkerLike(worker: ManagedWorkerLike, message: WorkerLikeMessage): void {
    try {
      if ('postMessage' in worker.worker) {
        worker.worker.postMessage(message);
      } else {
        throw new Error('WorkerLike does not support postMessage');
      }
    } catch (error) {
      this.markWorkerLikeUnhealthy(worker.id);
      throw new Error(`Failed to send message to worker ${worker.id}: ${error}`);
    }
  }

  /**
   * Check health of a specific worker.
   */
  private async checkWorkerLikeHealth(worker: ManagedWorkerLike): Promise<void> {
    if (!worker.isHealthy) return;

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.markWorkerLikeUnhealthy(worker.id);
        resolve();
      }, this.config.healthCheckTimeout);

      const originalOnMessage = worker.worker.onmessage;

      const healthCheckHandler = (event: { data: WorkerLikeMessage }) => {
        if (event.data.type === 'pong') {
          clearTimeout(timeoutId);
          worker.worker.onmessage = originalOnMessage || null;
          resolve();
        }
      };

      worker.worker.onmessage = healthCheckHandler;
      this.sendToWorkerLike(worker, { type: 'ping' });
    });
  }

  /**
   * Mark a worker as unhealthy and schedule replacement.
   */
  private markWorkerLikeUnhealthy(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      (worker as any).isHealthy = false;

      if (this.config.enableLogging) {
        // eslint-disable-next-line no-console
        console.log(`WorkerLike ${workerId} marked as unhealthy`);
      }

      // Cancel all active tests for this worker
      for (const testId of worker.activeTests) {
        const pending = this.pendingTests.get(testId);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pendingTests.delete(testId);
          pending.reject(new Error(`WorkerLike ${workerId} became unhealthy`));
        }
      }
      worker.activeTests.clear();

      // Schedule worker replacement
      setTimeout(() => {
        this.replaceWorkerLike(workerId);
      }, 1000);
    }
  }

  /**
   * Replace an unhealthy worker with a new one.
   */
  private async replaceWorkerLike(workerId: string): Promise<void> {
    const oldWorkerLike = this.workers.get(workerId);
    if (oldWorkerLike) {
      this.workers.delete(workerId);
      await this.terminateWorkerLike(oldWorkerLike);

      try {
        await this.createWorkerLike();
        if (this.config.enableLogging) {
          // eslint-disable-next-line no-console
          console.log(`Replaced unhealthy worker ${workerId}`);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to replace worker ${workerId}:`, error);
      }
    }
  }

  /**
   * Terminate a worker and clean up resources.
   */
  private async terminateWorkerLike(worker: ManagedWorkerLike): Promise<void> {
    try {
      if ('terminate' in worker.worker) {
        worker.worker.terminate();
      } else {
        this.sendToWorkerLike(worker, { type: 'terminate' });
      }
    } catch (error) {
      if (this.config.enableLogging) {
        // eslint-disable-next-line no-console
        console.warn(`Error terminating worker ${worker.id}:`, error);
      }
    }
  }
}

/**
 * Singleton worker pool instance for the application.
 */
let globalWorkerLikePool: WorkerLikePool | null = null;

/**
 * Get the global worker pool instance, creating it if necessary.
 */
export function getWorkerLikePool(config?: WorkerLikePoolConfig): WorkerLikePool {
  if (!globalWorkerLikePool) {
    globalWorkerLikePool = new WorkerLikePool(config);
  }
  return globalWorkerLikePool;
}

/**
 * Shutdown the global worker pool if it exists.
 */
export async function shutdownWorkerLikePool(): Promise<void> {
  if (globalWorkerLikePool) {
    await globalWorkerLikePool.shutdown();
    globalWorkerLikePool = null;
  }
}
