/**
 * Standalone worker script for Node.js worker_threads execution.
 *
 * This script runs in an isolated worker_threads context and handles
 * test function execution with proper error handling, timeouts, and
 * performance monitoring.
 */

import { parentPort, workerData } from 'worker_threads';
import { performance } from 'perf_hooks';
import { deserializeFunction, type SerializedFunction } from './function-serializer.js';

/**
 * Worker message types for communication with main thread.
 */
type WorkerMessage =
  | { type: 'execute-test'; testId: string; input: unknown; serializedFunction: SerializedFunction }
  | { type: 'ping' }
  | { type: 'terminate' }
  | { type: 'health-check' };

type WorkerResponse =
  | { type: 'test-result'; testId: string; result: TestResult; timing: number }
  | { type: 'test-error'; testId: string; error: string; timing: number }
  | { type: 'pong' }
  | { type: 'health-status'; status: HealthStatus }
  | { type: 'worker-ready'; workerId: string };

/**
 * Test result structure (matches parent interface).
 */
interface TestResult {
  readonly type: 'pass' | 'fail' | 'discard';
  readonly testsRun: number;
  readonly counterexample?: string | undefined;
  readonly shrinksPerformed?: number | undefined;
  readonly propertyName?: string | undefined;
  readonly assertionType?: string | undefined;
  readonly shrinkSteps?: unknown[] | undefined;
}

/**
 * Worker health status information.
 */
interface HealthStatus {
  readonly workerId: string;
  readonly memoryUsage: NodeJS.MemoryUsage;
  readonly uptime: number;
  readonly testsExecuted: number;
  readonly lastError?: string | undefined;
  readonly isHealthy: boolean;
}

/**
 * Worker state management.
 */
class WorkerState {
  private testsExecuted = 0;
  private lastError?: string;
  private startTime = performance.now();

  incrementTestCount(): void {
    this.testsExecuted++;
  }

  setLastError(error: string): void {
    this.lastError = error;
  }

  getHealthStatus(): HealthStatus {
    return {
      workerId: workerData?.workerId || 'unknown',
      memoryUsage: process.memoryUsage(),
      uptime: performance.now() - this.startTime,
      testsExecuted: this.testsExecuted,
      lastError: this.lastError || undefined,
      isHealthy: true, // TODO: Add more sophisticated health checks
    };
  }
}

const workerState = new WorkerState();

/**
 * Execute a test function with proper isolation and error handling.
 */
async function executeTest(
  testId: string,
  input: unknown,
  serializedFunction: SerializedFunction
): Promise<void> {
  const startTime = performance.now();

  try {
    // Deserialize the test function
    const testFunction = deserializeFunction<(input: unknown) => TestResult | Promise<TestResult>>(
      serializedFunction
    );

    // Execute the test function with timeout protection
    const result = await executeWithTimeout(testFunction, input, 30000); // 30 second timeout

    const timing = performance.now() - startTime;

    // Validate result structure
    const validatedResult = validateTestResult(result);

    workerState.incrementTestCount();

    // Send success response
    sendResponse({
      type: 'test-result',
      testId,
      result: validatedResult,
      timing,
    });

  } catch (error) {
    const timing = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    workerState.setLastError(errorMessage);

    // Send error response
    sendResponse({
      type: 'test-error',
      testId,
      error: errorMessage,
      timing,
    });
  }
}

/**
 * Execute a function with timeout protection.
 */
async function executeWithTimeout<T>(
  fn: (input: unknown) => T | Promise<T>,
  input: unknown,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Test execution timed out after ${timeoutMs}ms`));
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

/**
 * Validate and normalize test result structure.
 */
function validateTestResult(result: unknown): TestResult {
  if (typeof result === 'boolean') {
    // Convert boolean to proper TestResult
    return {
      type: result ? 'pass' : 'fail',
      testsRun: 1,
      ...(result ? {} : { counterexample: 'Test function returned false' }),
    };
  }

  if (typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>;

    // Validate required fields
    if (!obj.type || !['pass', 'fail', 'discard'].includes(obj.type as string)) {
      throw new Error('Test result must have a valid type field');
    }

    if (typeof obj.testsRun !== 'number' || obj.testsRun < 0) {
      throw new Error('Test result must have a valid testsRun field');
    }

    // Return validated result
    return {
      type: obj.type as 'pass' | 'fail' | 'discard',
      testsRun: obj.testsRun as number,
      counterexample: (obj.counterexample as string) || undefined,
      shrinksPerformed: (obj.shrinksPerformed as number) || undefined,
      propertyName: (obj.propertyName as string) || undefined,
      assertionType: (obj.assertionType as string) || undefined,
      shrinkSteps: (obj.shrinkSteps as unknown[]) || undefined,
    };
  }

  throw new Error('Test result must be a boolean or valid TestResult object');
}

/**
 * Send response to parent thread safely.
 */
function sendResponse(response: WorkerResponse): void {
  try {
    if (parentPort) {
      parentPort.postMessage(response);
    } else {
      console.error('parentPort not available - cannot send response');
    }
  } catch (error) {
    console.error('Failed to send response to parent:', error);
  }
}

/**
 * Handle incoming messages from parent thread.
 */
function handleMessage(message: WorkerMessage): void {
  try {
    switch (message.type) {
      case 'execute-test':
        executeTest(message.testId, message.input, message.serializedFunction);
        break;

      case 'ping':
        sendResponse({ type: 'pong' });
        break;

      case 'health-check':
        sendResponse({
          type: 'health-status',
          status: workerState.getHealthStatus(),
        });
        break;

      case 'terminate':
        process.exit(0);
        break;

      default:
        console.warn('Unknown message type received:', (message as any).type);
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

/**
 * Initialize worker and set up message handling.
 */
function initializeWorker(): void {
  if (!parentPort) {
    console.error('Worker script must be run in worker_threads context');
    process.exit(1);
  }

  // Set up message handler
  parentPort.on('message', handleMessage);

  // Set up error handlers
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in worker:', error);
    // Don't exit immediately - let the worker pool handle replacement
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection in worker:', reason);
    // Don't exit immediately - let the worker pool handle replacement
  });

  // Send ready signal
  sendResponse({
    type: 'worker-ready',
    workerId: workerData?.workerId || 'unknown',
  });
}

// Start the worker if this script is being run directly
// In ES modules, check if this is the main module using import.meta.url
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeWorker();
}

// Export for testing purposes
export { executeTest, validateTestResult, WorkerState };
