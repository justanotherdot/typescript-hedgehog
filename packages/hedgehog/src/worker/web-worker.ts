/**
 * Enhanced Web Worker implementation for browser environments.
 *
 * Provides true browser worker isolation with proper lifecycle control,
 * error handling, and compatibility across different browser environments.
 */

import {
  createWorkerSafeFunction,
  type SerializedFunction,
} from './function-serializer.js';

/**
 * Message types for Web Worker communication.
 */
type WorkerMessage =
  | {
      type: 'execute-test';
      testId: string;
      input: unknown;
      serializedFunction: SerializedFunction;
    }
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
 * Validation functions for Web Worker responses.
 */
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
 * Worker health status for browsers.
 */
export interface HealthStatus {
  readonly workerId: string;
  readonly uptime: number;
  readonly testsExecuted: number;
  readonly lastError?: string;
  readonly isHealthy: boolean;
}

/**
 * Configuration for Web Worker creation.
 */
export interface WebWorkerConfig {
  /** Timeout for test execution (ms) */
  readonly testTimeout: number;
  /** Timeout for health checks (ms) */
  readonly healthCheckTimeout: number;
  /** Whether to enable detailed logging */
  readonly enableLogging: boolean;
}

/**
 * Result of executing a test on a Web Worker.
 */
export interface WebWorkerTestResult {
  readonly success: boolean;
  readonly result?: TestResult;
  readonly error?: string;
  readonly timing: number;
  readonly workerId: string;
}

/**
 * Managed Web Worker with enhanced capabilities.
 */
export class WebWorkerInstance {
  private readonly worker: Worker;
  private readonly config: WebWorkerConfig;
  private readonly workerId: string;
  private readonly createdAt: number;
  private readonly pendingTests = new Map<
    string,
    {
      resolve: (result: WebWorkerTestResult) => void;
      reject: (error: Error) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();

  private isHealthy = true;
  private isReady = false;
  private lastHealthCheck = 0;
  private lastError?: string;
  private isTerminating = false;
  private pendingHealthChecks = new Map<
    string,
    {
      resolve: (status: HealthStatus) => void;
      reject: (error: Error) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(workerId: string, config: WebWorkerConfig) {
    this.workerId = workerId;
    this.config = config;
    this.createdAt = performance.now();

    // Create inline worker with enhanced test execution logic
    this.worker = this.createInlineWorker();
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
        reject(
          new Error(
            `Worker ${this.workerId} did not become ready within ${timeoutMs}ms`
          )
        );
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
  ): Promise<WebWorkerTestResult> {
    if (!this.isHealthy) {
      throw new Error(`Worker ${this.workerId} is not healthy`);
    }

    if (this.isTerminating) {
      throw new Error(
        `Worker ${this.workerId} is terminating and cannot accept new tests`
      );
    }

    if (!this.isReady) {
      await this.waitForReady();
    }

    // Generate unique test ID
    const testId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    try {
      // Serialize the test function with proper safety validation
      const serializedFunction = createWorkerSafeFunction(testFunction);

      return new Promise<WebWorkerTestResult>((resolve, reject) => {
        // Set up timeout
        const timeoutId = setTimeout(() => {
          this.pendingTests.delete(testId);
          this.markUnhealthy(
            `Test ${testId} timed out after ${this.config.testTimeout}ms`
          );
          reject(
            new Error(
              `Test ${testId} timed out after ${this.config.testTimeout}ms`
            )
          );
        }, this.config.testTimeout);

        // Check resource limits before registering test
        if (this.pendingTests.size >= 1000) {
          clearTimeout(timeoutId);
          this.markUnhealthy(
            `Worker ${this.workerId} has too many pending tests (${this.pendingTests.size})`
          );
          reject(
            new Error(
              `Worker ${this.workerId} has too many pending tests (${this.pendingTests.size})`
            )
          );
          return;
        }

        // Register pending test
        this.pendingTests.set(testId, { resolve, reject, timeoutId });

        // Send test to worker
        this.worker.postMessage({
          type: 'execute-test',
          testId,
          input,
          serializedFunction,
        } satisfies WorkerMessage);
      });
    } catch (error) {
      throw new Error(
        `Failed to execute test on worker ${this.workerId}: ${error}`
      );
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
      this.pendingHealthChecks.set(healthCheckId, {
        resolve,
        reject,
        timeoutId,
      });

      // Send health check request
      this.worker.postMessage({
        type: 'health-check',
        healthCheckId,
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

    return new Promise<boolean>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.markUnhealthy('Ping timed out');
        resolve(false);
      }, this.config.healthCheckTimeout);

      const pingHandler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'pong') {
          clearTimeout(timeoutId);
          this.worker.removeEventListener('message', pingHandler);
          resolve(true);
        }
      };

      this.worker.addEventListener('message', pingHandler);
      this.worker.postMessage({ type: 'ping' } satisfies WorkerMessage);
    });
  }

  /**
   * Terminate the worker.
   */
  async terminate(): Promise<void> {
    // Mark as terminating to prevent new tests
    this.isTerminating = true;
    this.isHealthy = false;

    // Cancel all pending tests
    for (const [testId, { reject, timeoutId }] of this.pendingTests) {
      clearTimeout(timeoutId);
      reject(new Error(`Test ${testId} cancelled due to worker termination`));
    }
    this.pendingTests.clear();

    // Cancel all pending health checks
    for (const [healthCheckId, { reject, timeoutId }] of this
      .pendingHealthChecks) {
      clearTimeout(timeoutId);
      reject(
        new Error(
          `Health check ${healthCheckId} cancelled due to worker termination`
        )
      );
    }
    this.pendingHealthChecks.clear();

    // Terminate worker
    this.worker.terminate();
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
   * Create an inline worker with enhanced test execution logic.
   */
  private createInlineWorker(): Worker {
    const workerScript = `
      // Worker state management
      let testsExecuted = 0;
      let lastError = undefined;
      const startTime = performance.now();
      const workerId = '${this.workerId}';

      // Worker message handler
      self.onmessage = function(event) {
        const message = event.data;

        try {
          switch (message.type) {
            case 'execute-test':
              executeTest(message);
              break;
            case 'ping':
              self.postMessage({ type: 'pong' });
              break;
            case 'health-check':
              self.postMessage({
                type: 'health-status',
                status: getHealthStatus(),
                healthCheckId: (message as any).healthCheckId
              });
              break;
            case 'terminate':
              self.close();
              break;
            default:
              console.warn('Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('Error handling message:', error);
        }
      };

      // Execute test function with proper isolation and error handling
      async function executeTest(message) {
        const { testId, input, serializedFunction } = message;
        const startTime = performance.now();

        try {
          // Deserialize the test function
          const testFunction = deserializeFunction(serializedFunction);

          // Execute the test function with timeout protection
          const result = await executeWithTimeout(testFunction, input, 30000);

          const timing = performance.now() - startTime;

          // Validate result structure
          const validatedResult = validateTestResult(result);

          testsExecuted++;

          // Send success response
          self.postMessage({
            type: 'test-result',
            testId,
            result: validatedResult,
            timing
          });

        } catch (error) {
          const timing = performance.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);

          lastError = errorMessage;

          // Send error response
          self.postMessage({
            type: 'test-error',
            testId,
            error: errorMessage,
            timing
          });
        }
      }

      // Deserialize function from serialized representation
      function deserializeFunction(serialized) {
        try {
          const reconstructed = new Function('return ' + serialized.code)();
          if (typeof reconstructed !== 'function') {
            throw new Error('Deserialized code did not produce a function');
          }
          return reconstructed;
        } catch (error) {
          throw new Error('Failed to deserialize function: ' + error.message);
        }
      }

      // Execute function with timeout protection
      async function executeWithTimeout(fn, input, timeoutMs) {
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Test execution timed out after ' + timeoutMs + 'ms'));
          }, timeoutMs);

          Promise.resolve(fn(input))
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

      // Validate and normalize test result structure
      function validateTestResult(result) {
        if (typeof result === 'boolean') {
          // Convert boolean to proper TestResult
          return {
            type: result ? 'pass' : 'fail',
            testsRun: 1,
            counterexample: result ? undefined : 'Test function returned false'
          };
        }

        if (typeof result === 'object' && result !== null) {
          // Validate required fields
          if (!result.type || !['pass', 'fail', 'discard'].includes(result.type)) {
            throw new Error('Test result must have a valid type field');
          }

          if (typeof result.testsRun !== 'number' || result.testsRun < 0) {
            throw new Error('Test result must have a valid testsRun field');
          }

          // Return validated result
          return {
            type: result.type,
            testsRun: result.testsRun,
            counterexample: result.counterexample,
            shrinksPerformed: result.shrinksPerformed,
            propertyName: result.propertyName,
            assertionType: result.assertionType,
            shrinkSteps: result.shrinkSteps
          };
        }

        throw new Error('Test result must be a boolean or valid TestResult object');
      }

      // Get worker health status
      function getHealthStatus() {
        return {
          workerId: workerId,
          uptime: performance.now() - startTime,
          testsExecuted: testsExecuted,
          lastError: lastError,
          isHealthy: true
        };
      }

      // Error handlers
      self.onerror = function(error) {
        console.error('Worker error:', error);
        lastError = error instanceof Error ? error.message : String(error);
      };

      self.onunhandledrejection = function(event) {
        console.error('Unhandled rejection in worker:', event.reason);
        lastError = String(event.reason);
      };

      // Send ready signal
      self.postMessage({
        type: 'worker-ready',
        workerId: workerId
      });
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);

    const worker = new Worker(workerUrl);

    // Clean up blob URL after worker creation
    URL.revokeObjectURL(workerUrl);

    return worker;
  }

  /**
   * Set up message handling from worker.
   */
  private setupMessageHandling(): void {
    this.worker.addEventListener('message', (event: MessageEvent<unknown>) => {
      try {
        // Validate message structure before processing
        let response: WorkerResponse;
        try {
          response = validateWorkerResponse(event.data);
        } catch (validationError) {
          this.markUnhealthy(`Invalid message from worker: ${validationError}`);
          if (this.config.enableLogging) {
            console.error(
              `Worker ${this.workerId} sent invalid message:`,
              validationError
            );
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
              console.warn(
                `Received health-status response with unknown or missing ID: ${healthCheckId}`
              );
            }
            break;
          }

          default:
            if (this.config.enableLogging) {
              console.warn(
                `Unknown response type from worker ${this.workerId}:`,
                (response as any).type
              );
            }
        }
      } catch (error) {
        this.markUnhealthy(`Error handling message: ${error}`);
        if (this.config.enableLogging) {
          console.error(
            `Error handling message from worker ${this.workerId}:`,
            error
          );
        }
      }
    });
  }

  /**
   * Set up error handling for worker.
   */
  private setupErrorHandling(): void {
    this.worker.addEventListener('error', (event: ErrorEvent) => {
      this.markUnhealthy(`Worker error: ${event.message}`);
      if (this.config.enableLogging) {
        console.error(`Worker ${this.workerId} error:`, event);
      }
    });

    this.worker.addEventListener('messageerror', (event: MessageEvent) => {
      this.markUnhealthy(`Message error: ${event.data}`);
      if (this.config.enableLogging) {
        console.error(`Worker ${this.workerId} message error:`, event);
      }
    });
  }

  /**
   * Handle successful test result.
   */
  private handleTestResult(response: {
    testId: string;
    result: TestResult;
    timing: number;
  }): void {
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
  private handleTestError(response: {
    testId: string;
    error: string;
    timing: number;
  }): void {
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
 * WorkerLike adapter for WebWorkerInstance.
 */
export class WebWorkerLike {
  private readonly instance: WebWorkerInstance;

  constructor(config: import('../worker.js').WorkerLikePoolConfig) {
    // Generate a unique worker ID
    const workerId = `web_worker_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Convert from WorkerLikePoolConfig to WebWorkerConfig
    const webConfig: WebWorkerConfig = {
      testTimeout: config.testTimeout,
      healthCheckTimeout: config.healthCheckTimeout,
      enableLogging: config.enableLogging,
    };

    this.instance = new WebWorkerInstance(workerId, webConfig);
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
    return !this.instance.getStats().isHealthy;
  }
}
