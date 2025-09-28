/**
 * Experimental APIs for typescript-hedgehog.
 *
 * @experimental All exports from this module are experimental and may change
 * in future releases. Use at your own risk in production environments.
 *
 * These APIs are provided for early adopters and to gather feedback.
 * Breaking changes may occur in minor or patch releases for experimental APIs.
 */

// Re-export parallel testing APIs
export {
  forAllParallel,
  parallelProperty,
  parallelPropertyWithResult,
  defaultParallelConfig,
  type ParallelConfig,
  type ParallelTestResult,
  type ParallelTestResultType,
  type ParallelPerformanceMetrics,
  type ParallelExecutionIssues,
  type WorkerExecutionResult,
  type WorkerTimingInfo,
  ParallelProperty,
} from './parallel.js';

// Re-export concurrent testing APIs
export {
  forAllConcurrent,
  concurrentProperty,
  detectRaceConditions,
  defaultConcurrentConfig,
  type ConcurrentConfig,
  type ConcurrentTestResult,
  type ConcurrentPropertyResult,
  type RaceConditionPattern,
  type ConcurrentPerformanceAnalysis,
  ConcurrentProperty,
} from './concurrent.js';

// Re-export worker management APIs
export {
  WorkerLikePool,
  getWorkerLikePool,
  shutdownWorkerLikePool,
  defaultWorkerLikePoolConfig,
  type WorkerLikePoolConfig,
  type WorkerLikeTestResult,
  type ManagedWorkerLike,
  type TestResult,
  type WorkerLikeMessage,
} from './worker.js';
