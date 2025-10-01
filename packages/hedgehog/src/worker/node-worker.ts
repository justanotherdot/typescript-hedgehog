/**
 * Node.js worker_threads implementation for true process isolation.
 *
 * Provides real worker thread management with proper lifecycle control,
 * error handling, and performance monitoring for concurrent property testing.
 */

import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { performance } from 'perf_hooks';
import { createWorkerSafeFunction, type SerializedFunction } from './function-serializer.js';

// Get the current module's directory for worker script path
const __filename = fileURLToPath(import.meta.url);

/**
 * Message types for worker communication.
 */
type WorkerMessage =
  | { type: 'execute-test'; testId: string; input: unknown; serializedFunction: SerializedFunction }
  | { type: 'ping' }
  | { type: 'terminate' }
  | { type: 'health-check'; healthCheckId?: string };

type WorkerResponse =
  | { type: 'test-result'; testId: string; result: TestResult; timing: number }
  | { type: 'test-error'; testId: string; error: string; timing: number }
  | { type: 'pong' }
  | { type: 'health-status'; status: HealthStatus; healthCheckId?: string }
  | { type: 'worker-ready'; workerId: string };

/**
 * Validation functions for worker messages.
 */
function validateWorkerMessage(message: unknown): WorkerMessage {
  if (!message || typeof message !== 'object') {
    throw new Error('Worker message must be an object');
  }

  const msg = message as Record<string, unknown>;

  if (typeof msg.type !== 'string') {
    throw new Error('Worker message must have a type field');
  }

  switch (msg.type) {
    case 'execute-test':
      if (typeof msg.testId !== 'string' || msg.testId.length === 0) {
        throw new Error('execute-test message must have a non-empty testId');
      }
      if (msg.testId.length > 256) {
        throw new Error('execute-test testId too long (max 256 chars)');
      }
      if (!msg.serializedFunction || typeof msg.serializedFunction !== 'object') {
        throw new Error('execute-test message must have a serializedFunction object');
      }
      // input can be any type, so we don't validate it
      return msg as WorkerMessage;

    case 'ping':
    case 'terminate':
    case 'health-check':
      return msg as WorkerMessage;

    default:
      throw new Error(`Unknown worker message type: ${msg.type}`);
  }
}

function validateWorkerResponse(response: unknown): WorkerResponse {
  if (!response || typeof response !== 'object') {
    throw new Error('Worker response must be an object');
  }

  const resp = response as Record<string, unknown>;

  if (typeof resp.type !== 'string') {
    throw new Error('Worker response must have a type field');
  }

  switch (resp.type) {
    case 'test-result':
      if (typeof resp.testId !== 'string' || resp.testId.length === 0) {
        throw new Error('test-result response must have a non-empty testId');
      }
      if (typeof resp.timing !== 'number' || resp.timing < 0) {
        throw new Error('test-result response must have a non-negative timing');
      }
      if (!resp.result || typeof resp.result !== 'object') {
        throw new Error('test-result response must have a result object');
      }
      return resp as WorkerResponse;

    case 'test-error':
      if (typeof resp.testId !== 'string' || resp.testId.length === 0) {
        throw new Error('test-error response must have a non-empty testId');
      }
      if (typeof resp.error !== 'string') {
        throw new Error('test-error response must have an error string');
      }
      if (typeof resp.timing !== 'number' || resp.timing < 0) {
        throw new Error('test-error response must have a non-negative timing');
      }
      return resp as WorkerResponse;

    case 'pong':
      return resp as WorkerResponse;

    case 'health-status':
      if (!resp.status || typeof resp.status !== 'object') {
        throw new Error('health-status response must have a status object');
      }
      return resp as WorkerResponse;

    case 'worker-ready':
      if (typeof resp.workerId !== 'string' || resp.workerId.length === 0) {
        throw new Error('worker-ready response must have a non-empty workerId');
      }
      return resp as WorkerResponse;

    default:
      throw new Error(`Unknown worker response type: ${resp.type}`);
  }
}

/**
 * Test result structure.
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
 * Worker health status.
 */
export interface HealthStatus {
  readonly workerId: string;
  readonly memoryUsage: NodeJS.MemoryUsage;
  readonly uptime: number;
  readonly testsExecuted: number;
  readonly lastError?: string;
  readonly isHealthy: boolean;
}

/**
 * Configuration for Node.js worker creation.
 */
export interface NodeWorkerConfig {
  /** Timeout for test execution (ms) */
  readonly testTimeout: number;
  /** Timeout for health checks (ms) */
  readonly healthCheckTimeout: number;
  /** Maximum memory usage before worker restart (bytes) */
  readonly maxMemoryUsage?: number;
  /** Maximum number of pending tests (default: 100) */
  readonly maxPendingTests?: number;
  /** Maximum worker initialization timeout (ms, default: 10000) */
  readonly maxInitTimeout?: number;
  /** Whether to enable detailed logging */
  readonly enableLogging: boolean;
}

/**
 * Result of executing a test on a Node.js worker.
 */
export interface NodeWorkerTestResult {
  readonly success: boolean;
  readonly result?: TestResult;
  readonly error?: string;
  readonly timing: number;
  readonly workerId: string;
}

/**
 * Managed Node.js worker with enhanced capabilities.
 */
export class NodeWorkerInstance {
  private readonly worker: Worker;
  private readonly config: NodeWorkerConfig;
  private readonly workerId: string;
  private readonly createdAt: number;
  private readonly maxPendingTests: number;
  private readonly pendingTests = new Map<string, {
    resolve: (result: NodeWorkerTestResult) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
    createdAt: number;
  }>();

  private isHealthy = true;
  private isReady = false;
  private lastHealthCheck = 0;
  private lastError?: string;
  private isTerminating = false;
  private pendingHealthChecks = new Map<string, {
    resolve: (status: HealthStatus) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>();

  constructor(workerId: string, config: NodeWorkerConfig) {
    this.workerId = workerId;
    this.config = config;
    this.createdAt = performance.now();
    this.maxPendingTests = config.maxPendingTests || 100;

    // Validate worker ID
    if (!workerId || workerId.length === 0 || workerId.length > 64) {
      throw new Error('Worker ID must be between 1 and 64 characters');
    }

    // Create worker with our worker script
    // Need to handle both development (src) and production (dist) scenarios
    const currentDir = dirname(__filename);
    let workerScriptPath = join(currentDir, 'worker-script.js');

    // If we're in src directory (development), point to dist directory
    if (currentDir.includes('/src/')) {
      const distDir = currentDir.replace('/src/', '/dist/');
      workerScriptPath = join(distDir, 'worker-script.js');
    }

    if (this.config.enableLogging) {
      console.log(`Creating Node.js worker with script path: ${workerScriptPath}`);
    }

    try {
      // Add more detailed logging for CI debugging
      if (this.config.enableLogging) {
        console.log(`Attempting to create worker with script: ${workerScriptPath}`);
        console.log(`Working directory: ${process.cwd()}`);
        console.log(`__filename: ${__filename}`);
        console.log(`__dirname: ${dirname(__filename)}`);

        // Check if the worker script file exists
        const fs = require('fs');
        try {
          fs.statSync(workerScriptPath);
          console.log(`Worker script exists at: ${workerScriptPath}`);
        } catch (_fsError) {
          console.error(`Worker script NOT found at: ${workerScriptPath}`);
          console.log(`Listing directory contents:`);
          try {
            const dirContents = fs.readdirSync(dirname(workerScriptPath));
            console.log(`Directory ${dirname(workerScriptPath)}: [${dirContents.join(', ')}]`);
          } catch (_dirError) {
            console.error(`Cannot read directory ${dirname(workerScriptPath)}: ${_dirError}`);
          }
        }
      }

      this.worker = new Worker(workerScriptPath, {
        workerData: { workerId },
        // Enable transferList for potential performance improvements
        transferList: [],
      });

      if (this.config.enableLogging) {
        console.log(`Successfully created worker ${workerId}`);
      }
    } catch (error) {
      const errorMessage = `Failed to create worker with script '${workerScriptPath}': ${error}`;
      if (this.config.enableLogging) {
        console.error(errorMessage);
        console.error(`Current working directory: ${process.cwd()}`);
        console.error(`Script path attempted: ${workerScriptPath}`);
      }
      throw new Error(errorMessage);
    }

    this.setupMessageHandling();
    this.setupErrorHandling();
  }

  /**
   * Wait for worker to be ready.
   */
  async waitForReady(timeoutMs: number = 15000): Promise<void> {
    if (this.isReady) return;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Worker ${this.workerId} did not become ready within ${timeoutMs}ms`));
      }, timeoutMs);

      const checkReady = () => {
        if (this.isReady) {
          clearTimeout(timeoutId);
          resolve();
        } else {
          setTimeout(checkReady, 50);
        }
      };

      checkReady();
    });
  }

  /**
   * Execute a test function on this worker.
   */
  async executeTest(
    input: unknown,
    testFunction: (input: unknown) => TestResult | Promise<TestResult>
  ): Promise<NodeWorkerTestResult> {
    // Check worker state
    if (!this.isHealthy) {
      throw new Error(`Worker ${this.workerId} is not healthy`);
    }

    if (this.isTerminating) {
      throw new Error(`Worker ${this.workerId} is terminating`);
    }

    // Check queue limits
    if (this.pendingTests.size >= this.maxPendingTests) {
      throw new Error(`Worker ${this.workerId} queue full (${this.maxPendingTests} pending tests)`);
    }

    if (!this.isReady) {
      await this.waitForReady();
    }

    // Generate unique test ID
    const testId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Validate inputs
    if (typeof testFunction !== 'function') {
      throw new Error('Test function must be a function');
    }

    try {
      // Serialize the test function WITHOUT allowUnsafe flag
      const serializedFunction = createWorkerSafeFunction(testFunction);

      return new Promise<NodeWorkerTestResult>((resolve, reject) => {
        // Set up timeout
        const timeoutId = setTimeout(() => {
          this.pendingTests.delete(testId);
          this.markUnhealthy(`Test ${testId} timed out after ${this.config.testTimeout}ms`);
          reject(new Error(`Test ${testId} timed out after ${this.config.testTimeout}ms`));
        }, this.config.testTimeout);

        // Register pending test with creation timestamp
        this.pendingTests.set(testId, {
          resolve,
          reject,
          timeoutId,
          createdAt: performance.now()
        });

        try {
          // Validate message before sending
          const message: WorkerMessage = {
            type: 'execute-test',
            testId,
            input,
            serializedFunction,
          };

          validateWorkerMessage(message);

          // Send test to worker
          this.worker.postMessage(message);
        } catch (messageError) {
          // Clean up on message validation failure
          clearTimeout(timeoutId);
          this.pendingTests.delete(testId);
          reject(new Error(`Failed to send test message: ${messageError}`));
        }
      });

    } catch (error) {
      throw new Error(`Failed to execute test on worker ${this.workerId}: ${error}`);
    }
  }

  /**
   * Check worker health.
   */
  async checkHealth(): Promise<HealthStatus> {
    if (!this.isHealthy) {
      throw new Error(`Worker ${this.workerId} is not healthy`);
    }

    if (this.isTerminating) {
      throw new Error(`Worker ${this.workerId} is terminating`);
    }

    // Generate unique health check ID
    const healthCheckId = `health_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    return new Promise<HealthStatus>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingHealthChecks.delete(healthCheckId);
        this.markUnhealthy('Health check timed out');
        reject(new Error(`Health check timed out for worker ${this.workerId}`));
      }, this.config.healthCheckTimeout);

      // Register pending health check
      this.pendingHealthChecks.set(healthCheckId, { resolve, reject, timeoutId });

      // Send health check request
      this.worker.postMessage({
        type: 'health-check',
        healthCheckId
      } satisfies WorkerMessage);
    });
  }

  /**
   * Ping the worker to verify responsiveness.
   */
  async ping(): Promise<boolean> {
    if (!this.isHealthy) {
      return false;
    }

    return new Promise<boolean>(resolve => {
      const timeoutId = setTimeout(() => {
        this.markUnhealthy('Ping timed out');
        resolve(false);
      }, this.config.healthCheckTimeout);

      const originalListeners = this.worker.listeners('message');

      const pingHandler = (response: WorkerResponse) => {
        if (response.type === 'pong') {
          clearTimeout(timeoutId);

          // Restore original message handlers
          this.worker.removeAllListeners('message');
          originalListeners.forEach(handler => this.worker.on('message', handler as (...args: any[]) => void));

          resolve(true);
        }
      };

      this.worker.on('message', pingHandler);
      this.worker.postMessage({ type: 'ping' } satisfies WorkerMessage);
    });
  }

  /**
   * Terminate the worker.
   */
  async terminate(): Promise<void> {
    // Prevent new tests from being queued
    this.isTerminating = true;
    this.isHealthy = false;

    if (this.config.enableLogging) {
      console.log(`Terminating worker ${this.workerId} with ${this.pendingTests.size} pending tests`);
    }

    // Cancel all pending tests
    const pendingTestErrors: Error[] = [];
    for (const [testId, { reject, timeoutId }] of this.pendingTests) {
      try {
        clearTimeout(timeoutId);
        reject(new Error(`Test ${testId} cancelled due to worker termination`));
      } catch (error) {
        pendingTestErrors.push(error as Error);
      }
    }
    this.pendingTests.clear();

    // Cancel all pending health checks
    for (const [healthCheckId, { reject, timeoutId }] of this.pendingHealthChecks) {
      try {
        clearTimeout(timeoutId);
        reject(new Error(`Health check ${healthCheckId} cancelled due to worker termination`));
      } catch (error) {
        pendingTestErrors.push(error as Error);
      }
    }
    this.pendingHealthChecks.clear();

    // Request graceful shutdown with timeout
    const gracefulTimeout = 500; // 500ms for graceful shutdown (reduced for faster tests)
    try {
      await new Promise<void>((resolve) => {
        const forceTimeoutId = setTimeout(() => {
          if (this.config.enableLogging) {
            console.log(`Worker ${this.workerId} graceful shutdown timed out, forcing termination`);
          }
          resolve(); // Don't reject, just proceed to force termination
        }, gracefulTimeout);

        const exitHandler = (code: number) => {
          clearTimeout(forceTimeoutId);
          if (this.config.enableLogging) {
            console.log(`Worker ${this.workerId} exited gracefully with code ${code}`);
          }
          resolve();
        };

        const errorHandler = (error: Error) => {
          clearTimeout(forceTimeoutId);
          if (this.config.enableLogging) {
            console.log(`Worker ${this.workerId} error during graceful shutdown:`, error);
          }
          resolve(); // Don't reject, proceed to force termination
        };

        // Set up exit and error handlers
        this.worker.once('exit', exitHandler);
        this.worker.once('error', errorHandler);

        try {
          // Send termination message
          this.worker.postMessage({ type: 'terminate' } satisfies WorkerMessage);
        } catch (_error) {
          // If we can't send the message, just proceed to force termination
          clearTimeout(forceTimeoutId);
          this.worker.removeListener('exit', exitHandler);
          this.worker.removeListener('error', errorHandler);
          resolve();
        }
      });
    } catch (error) {
      if (this.config.enableLogging) {
        console.error(`Error during graceful shutdown of worker ${this.workerId}:`, error);
      }
    }

    // Force termination with timeout
    try {
      // Add timeout to force termination in case it hangs
      await Promise.race([
        this.worker.terminate(),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            if (this.config.enableLogging) {
              console.log(`Worker ${this.workerId} force termination timed out, continuing anyway`);
            }
            resolve();
          }, 1000); // 1 second timeout for force termination
        })
      ]);

      if (this.config.enableLogging) {
        console.log(`Worker ${this.workerId} forcefully terminated`);
      }
    } catch (error) {
      if (this.config.enableLogging) {
        console.error(`Error forcing termination of worker ${this.workerId}:`, error);
      }
      // Worker might already be dead, this is OK
    }

    // Log any errors that occurred during pending test cancellation
    if (pendingTestErrors.length > 0 && this.config.enableLogging) {
      console.warn(`Errors occurred while cancelling pending tests for worker ${this.workerId}:`, pendingTestErrors);
    }
  }

  /**
   * Get worker statistics.
   */
  getStats(): {
    workerId: string;
    isHealthy: boolean;
    isReady: boolean;
    uptime: number;
    activeTests: number;
    lastHealthCheck: number;
    lastError?: string;
  } {
    const stats: {
      workerId: string;
      isHealthy: boolean;
      isReady: boolean;
      uptime: number;
      activeTests: number;
      lastHealthCheck: number;
      lastError?: string;
    } = {
      workerId: this.workerId,
      isHealthy: this.isHealthy,
      isReady: this.isReady,
      uptime: performance.now() - this.createdAt,
      activeTests: this.pendingTests.size,
      lastHealthCheck: this.lastHealthCheck,
    };

    if (this.lastError) {
      stats.lastError = this.lastError;
    }

    return stats;
  }

  /**
   * Set up message handling from worker.
   */
  private setupMessageHandling(): void {
    this.worker.on('message', (rawResponse: unknown) => {
      try {
        // Validate message structure before processing
        let response: WorkerResponse;
        try {
          response = validateWorkerResponse(rawResponse);
        } catch (validationError) {
          this.markUnhealthy(`Invalid message from worker: ${validationError}`);
          if (this.config.enableLogging) {
            console.error(`Worker ${this.workerId} sent invalid message:`, validationError);
          }
          return;
        }

        switch (response.type) {
          case 'worker-ready':
            this.isReady = true;
            if (this.config.enableLogging) {
              console.log(`Worker ${this.workerId} is ready`);
            }
            break;

          case 'test-result':
            this.handleTestResult(response);
            break;

          case 'test-error':
            this.handleTestError(response);
            break;

          case 'pong':
            // Handled by ping method
            break;

          case 'health-status': {
            // Handle health check response with ID tracking
            const healthCheckId = response.healthCheckId;
            if (healthCheckId && this.pendingHealthChecks.has(healthCheckId)) {
              const pending = this.pendingHealthChecks.get(healthCheckId)!;
              this.pendingHealthChecks.delete(healthCheckId);
              clearTimeout(pending.timeoutId);
              this.lastHealthCheck = performance.now();
              pending.resolve(response.status);
            } else if (this.config.enableLogging) {
              console.warn(`Received health-status response with unknown or missing ID: ${healthCheckId}`);
            }
            break;
          }

          default:
            if (this.config.enableLogging) {
              console.warn(`Unknown response type from worker ${this.workerId}:`, (response as any).type);
            }
        }
      } catch (error) {
        this.markUnhealthy(`Error handling message: ${error}`);
        if (this.config.enableLogging) {
          console.error(`Error handling message from worker ${this.workerId}:`, error);
        }
      }
    });
  }

  /**
   * Set up error handling for worker.
   */
  private setupErrorHandling(): void {
    this.worker.on('error', (error) => {
      this.markUnhealthy(`Worker error: ${error.message}`);
      if (this.config.enableLogging) {
        console.error(`Worker ${this.workerId} error:`, error);
      }
    });

    this.worker.on('exit', (code) => {
      this.markUnhealthy(`Worker exited with code ${code}`);
      if (this.config.enableLogging) {
        console.log(`Worker ${this.workerId} exited with code ${code}`);
      }
    });

    this.worker.on('messageerror', (error) => {
      this.markUnhealthy(`Message error: ${error.message}`);
      if (this.config.enableLogging) {
        console.error(`Worker ${this.workerId} message error:`, error);
      }
    });
  }

  /**
   * Handle successful test result.
   */
  private handleTestResult(response: { testId: string; result: TestResult; timing: number }): void {
    const pending = this.pendingTests.get(response.testId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingTests.delete(response.testId);

      pending.resolve({
        success: true,
        result: response.result,
        timing: response.timing,
        workerId: this.workerId,
      });
    }
  }

  /**
   * Handle test error.
   */
  private handleTestError(response: { testId: string; error: string; timing: number }): void {
    const pending = this.pendingTests.get(response.testId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingTests.delete(response.testId);

      pending.resolve({
        success: false,
        error: response.error,
        timing: response.timing,
        workerId: this.workerId,
      });
    }
  }

  /**
   * Mark worker as unhealthy.
   */
  private markUnhealthy(reason: string): void {
    this.isHealthy = false;
    this.lastError = reason;

    // Cancel all pending tests
    for (const [_testId, { reject, timeoutId }] of this.pendingTests) {
      clearTimeout(timeoutId);
      reject(new Error(`Worker ${this.workerId} became unhealthy: ${reason}`));
    }
    this.pendingTests.clear();
  }
}

/**
 * WorkerLike adapter for NodeWorkerInstance.
 */
export class NodeWorkerLike {
  private readonly instance: NodeWorkerInstance;

  constructor(config: import('../worker.js').WorkerLikePoolConfig) {
    // Generate a unique worker ID
    const workerId = `node_worker_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Convert from WorkerLikePoolConfig to NodeWorkerConfig
    const nodeConfig: NodeWorkerConfig = {
      testTimeout: config.testTimeout,
      healthCheckTimeout: config.healthCheckTimeout,
      maxPendingTests: config.maxPendingTests,
      enableLogging: config.enableLogging,
    };

    this.instance = new NodeWorkerInstance(workerId, nodeConfig);
  }

  get id(): string {
    return this.instance.getStats().workerId;
  }

  async executeTest<TInput, TResult>(
    _testId: string | number,
    input: TInput,
    testFunction: (input: TInput) => TResult | Promise<TResult>
  ): Promise<import('../worker.js').TestExecutionResult<TResult>> {
    const result = await this.instance.executeTest(input, testFunction as any);

    if (result.success) {
      return {
        success: true,
        result: result.result as TResult,
        timing: result.timing,
        workerId: result.workerId,
      };
    } else {
      return {
        success: false,
        error: result.error || 'Unknown error occurred',
        timing: result.timing,
        workerId: result.workerId,
      };
    }
  }

  async ping(): Promise<boolean> {
    return this.instance.ping();
  }

  async terminate(): Promise<void> {
    return this.instance.terminate();
  }

  isTerminated(): boolean {
    const stats = this.instance.getStats();
    return !stats.isHealthy || stats.uptime === 0;
  }
}
