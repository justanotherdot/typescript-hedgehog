import { describe, test, expect } from 'vitest';
import * as BigIntSeed from './bigint.js';
import * as WasmSeed from './wasm.js';

/**
 * Rigorous statistical benchmarking with proper isolation and significance testing.
 *
 * This benchmark follows scientific methodology:
 * - Multiple isolated runs to measure variance
 * - Statistical significance testing
 * - Controlled environment (warmup, GC management)
 * - Distribution analysis
 */

interface BenchmarkResult {
  name: string;
  samples: number[];
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p95: number;
  p99: number;
}

interface ComparisonResult {
  approach1: BenchmarkResult;
  approach2: BenchmarkResult;
  speedup: number;
  pValue: number;
  significantDifference: boolean;
  confidenceInterval: [number, number];
}

function calculateStats(samples: number[]): BenchmarkResult {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = samples.length;

  const mean = samples.reduce((a, b) => a + b) / n;
  const median =
    n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

  const variance =
    samples.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];

  return {
    name: '',
    samples,
    mean,
    median,
    stdDev,
    min: Math.min(...samples),
    max: Math.max(...samples),
    p95,
    p99,
  };
}

function welchTTest(
  samples1: number[],
  samples2: number[]
): { pValue: number; confidenceInterval: [number, number] } {
  const n1 = samples1.length;
  const n2 = samples2.length;

  const mean1 = samples1.reduce((a, b) => a + b) / n1;
  const mean2 = samples2.reduce((a, b) => a + b) / n2;

  const var1 =
    samples1.reduce((acc, val) => acc + Math.pow(val - mean1, 2), 0) / (n1 - 1);
  const var2 =
    samples2.reduce((acc, val) => acc + Math.pow(val - mean2, 2), 0) / (n2 - 1);

  const pooledSE = Math.sqrt(var1 / n1 + var2 / n2);
  const tStat = (mean1 - mean2) / pooledSE;

  // Approximate degrees of freedom (Welch-Satterthwaite)
  const df =
    Math.pow(var1 / n1 + var2 / n2, 2) /
    (Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1));

  // Rough p-value approximation (for df > 30, t-distribution ≈ normal)
  const pValue = df > 30 ? 2 * (1 - normalCDF(Math.abs(tStat))) : 0.05; // Conservative

  // 95% confidence interval for difference of means
  const tCritical = 1.96; // For large samples
  const marginOfError = tCritical * pooledSE;
  const diffMeans = mean1 - mean2;

  return {
    pValue,
    confidenceInterval: [diffMeans - marginOfError, diffMeans + marginOfError],
  };
}

function normalCDF(x: number): number {
  // Approximation of normal CDF using error function
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function erf(x: number): number {
  // Abramowitz and Stegun approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

function isolatedBenchmark(
  name: string,
  setupFn: () => any,
  benchmarkFn: (state: any) => void,
  runs: number = 50,
  iterationsPerRun: number = 10000
): BenchmarkResult {
  const samples: number[] = [];

  for (let run = 0; run < runs; run++) {
    // Force garbage collection before each run (if available)
    if (global.gc) {
      global.gc();
    }

    // Fresh setup for each run to avoid state pollution
    const state = setupFn();

    // Warmup for this specific run
    for (let i = 0; i < 1000; i++) {
      benchmarkFn(state);
    }

    // Measure this run
    performance.mark(`${name}-run-${run}-start`);

    for (let i = 0; i < iterationsPerRun; i++) {
      benchmarkFn(state);
    }

    performance.mark(`${name}-run-${run}-end`);
    performance.measure(
      `${name}-run-${run}`,
      `${name}-run-${run}-start`,
      `${name}-run-${run}-end`
    );

    const measure = performance.getEntriesByName(`${name}-run-${run}`)[0];
    const timePerOperation = (measure.duration / iterationsPerRun) * 1000; // Convert to microseconds
    samples.push(timePerOperation);

    // Clean up performance entries
    performance.clearMarks(`${name}-run-${run}-start`);
    performance.clearMarks(`${name}-run-${run}-end`);
    performance.clearMeasures(`${name}-run-${run}`);
  }

  const result = calculateStats(samples);
  result.name = name;
  return result;
}

function compareBenchmarks(
  result1: BenchmarkResult,
  result2: BenchmarkResult
): ComparisonResult {
  const { pValue, confidenceInterval } = welchTTest(
    result1.samples,
    result2.samples
  );
  const speedup = result2.mean / result1.mean; // How much faster is result1 than result2

  return {
    approach1: result1,
    approach2: result2,
    speedup,
    pValue,
    significantDifference: pValue < 0.05,
    confidenceInterval,
  };
}

function printBenchmarkResult(result: BenchmarkResult) {
  console.log(`\n=== ${result.name} ===`);
  console.log(`Samples: ${result.samples.length}`);
  console.log(`Mean: ${result.mean.toFixed(3)}μs`);
  console.log(`Median: ${result.median.toFixed(3)}μs`);
  console.log(`Std Dev: ${result.stdDev.toFixed(3)}μs`);
  console.log(`Min: ${result.min.toFixed(3)}μs`);
  console.log(`Max: ${result.max.toFixed(3)}μs`);
  console.log(`P95: ${result.p95.toFixed(3)}μs`);
  console.log(`P99: ${result.p99.toFixed(3)}μs`);
  console.log(
    `Coefficient of Variation: ${((result.stdDev / result.mean) * 100).toFixed(1)}%`
  );
}

function printComparison(comparison: ComparisonResult) {
  const { approach1, approach2 } = comparison;
  console.log(`\n=== COMPARISON: ${approach1.name} vs ${approach2.name} ===`);
  console.log(
    `${approach1.name} is ${comparison.speedup.toFixed(2)}x ${comparison.speedup > 1 ? 'faster' : 'slower'} than ${approach2.name}`
  );
  console.log(
    `Mean difference: ${(approach1.mean - approach2.mean).toFixed(3)}μs`
  );
  console.log(
    `95% CI for difference: [${comparison.confidenceInterval[0].toFixed(3)}, ${comparison.confidenceInterval[1].toFixed(3)}]`
  );
  console.log(`P-value: ${comparison.pValue.toFixed(6)}`);
  console.log(
    `Statistically significant: ${comparison.significantDifference ? 'YES' : 'NO'}`
  );

  if (comparison.significantDifference) {
    const effect =
      Math.abs(approach1.mean - approach2.mean) /
      Math.max(approach1.stdDev, approach2.stdDev);
    console.log(
      `Effect size: ${effect.toFixed(2)} ${effect > 0.8 ? '(large)' : effect > 0.5 ? '(medium)' : '(small)'}`
    );
  }
}

describe('Statistical performance analysis', () => {
  const BENCHMARK_RUNS = 30; // Number of independent runs
  const ITERATIONS_PER_RUN = 5000; // Operations per run

  test('Constructor performance - isolated and rigorous', () => {
    console.log(
      `\nConstructor Performance Analysis (${BENCHMARK_RUNS} runs × ${ITERATIONS_PER_RUN} iterations)`
    );

    const bigintResult = isolatedBenchmark(
      'BigInt Constructor',
      () => Math.floor(Math.random() * 1000000), // Random seed each run
      (seed) => BigIntSeed.Seed.fromNumber(seed),
      BENCHMARK_RUNS,
      ITERATIONS_PER_RUN
    );

    const wasmResult = isolatedBenchmark(
      'WASM Constructor',
      () => Math.floor(Math.random() * 1000000),
      (seed) => WasmSeed.Seed.fromNumber(seed),
      BENCHMARK_RUNS,
      ITERATIONS_PER_RUN
    );

    printBenchmarkResult(bigintResult);
    printBenchmarkResult(wasmResult);

    const comparison = compareBenchmarks(wasmResult, bigintResult);
    printComparison(comparison);

    // Assertions based on statistical significance
    expect(comparison.significantDifference).toBe(true);
    if (comparison.significantDifference) {
      expect(comparison.speedup).toBeGreaterThan(1.5); // WASM should be significantly faster
    }
  });

  test('NextBool performance - isolated and rigorous', () => {
    console.log(
      `\nNextBool Performance Analysis (${BENCHMARK_RUNS} runs × ${ITERATIONS_PER_RUN} iterations)`
    );

    const bigintResult = isolatedBenchmark(
      'BigInt NextBool',
      () => {
        const seed = BigIntSeed.Seed.fromNumber(42);
        return { seed };
      },
      (state) => {
        const [, newSeed] = state.seed.nextBool();
        state.seed = newSeed;
      },
      BENCHMARK_RUNS,
      ITERATIONS_PER_RUN
    );

    const wasmResult = isolatedBenchmark(
      'WASM NextBool',
      () => {
        const seed = WasmSeed.Seed.fromNumber(42);
        return { seed };
      },
      (state) => {
        const [, newSeed] = state.seed.nextBool();
        state.seed = newSeed;
      },
      BENCHMARK_RUNS,
      ITERATIONS_PER_RUN
    );

    printBenchmarkResult(bigintResult);
    printBenchmarkResult(wasmResult);

    const comparison = compareBenchmarks(bigintResult, wasmResult);
    printComparison(comparison);
  });

  test('Batched WASM vs Individual calls - isolated comparison', () => {
    console.log(
      `\nBatched vs Individual Analysis (${BENCHMARK_RUNS} runs × ${ITERATIONS_PER_RUN / 100} batch operations)`
    );
    const BATCH_SIZE = 100;
    const BATCH_ITERATIONS = ITERATIONS_PER_RUN / BATCH_SIZE;

    const individualResult = isolatedBenchmark(
      'WASM Individual Calls',
      () => {
        const seed = WasmSeed.Seed.fromNumber(42);
        return { seed };
      },
      (state) => {
        // Simulate batch by doing 100 individual calls
        for (let i = 0; i < BATCH_SIZE; i++) {
          const [, newSeed] = state.seed.nextBool();
          state.seed = newSeed;
        }
      },
      BENCHMARK_RUNS,
      BATCH_ITERATIONS
    );

    const batchedResult = isolatedBenchmark(
      'WASM Batched Calls',
      () => {
        const seed = WasmSeed.Seed.fromNumber(42);
        return { seed };
      },
      (state) => {
        const result = state.seed.nextBoolsBatch(BATCH_SIZE);
        state.seed = result.finalSeed;
      },
      BENCHMARK_RUNS,
      BATCH_ITERATIONS
    );

    // Normalize to per-operation cost
    individualResult.samples = individualResult.samples.map(
      (s) => s / BATCH_SIZE
    );
    individualResult.mean = individualResult.mean / BATCH_SIZE;
    individualResult.median = individualResult.median / BATCH_SIZE;
    individualResult.stdDev = individualResult.stdDev / BATCH_SIZE;

    batchedResult.samples = batchedResult.samples.map((s) => s / BATCH_SIZE);
    batchedResult.mean = batchedResult.mean / BATCH_SIZE;
    batchedResult.median = batchedResult.median / BATCH_SIZE;
    batchedResult.stdDev = batchedResult.stdDev / BATCH_SIZE;

    printBenchmarkResult(individualResult);
    printBenchmarkResult(batchedResult);

    const comparison = compareBenchmarks(batchedResult, individualResult);
    printComparison(comparison);

    // Batching should show significant improvement
    if (comparison.significantDifference) {
      expect(comparison.speedup).toBeGreaterThan(2); // Expect at least 2x improvement
    }
  });

  test('Mixed workload performance - isolated analysis', () => {
    console.log(
      `\nMixed Workload Analysis (${BENCHMARK_RUNS} runs × ${ITERATIONS_PER_RUN} iterations)`
    );

    const bigintResult = isolatedBenchmark(
      'BigInt Mixed Workload',
      () => {
        const seed = BigIntSeed.Seed.fromNumber(42);
        return { seed };
      },
      (state) => {
        const [bound, seed1] = state.seed.nextBounded(100);
        const [bool, seed2] = seed1.nextBool();
        const [left, right] = seed2.split();
        state.seed = bool ? left : right;
      },
      BENCHMARK_RUNS,
      ITERATIONS_PER_RUN
    );

    const wasmResult = isolatedBenchmark(
      'WASM Mixed Workload',
      () => {
        const seed = WasmSeed.Seed.fromNumber(42);
        return { seed };
      },
      (state) => {
        const [bound, seed1] = state.seed.nextBounded(100);
        const [bool, seed2] = seed1.nextBool();
        const [left, right] = seed2.split();
        state.seed = bool ? left : right;
      },
      BENCHMARK_RUNS,
      ITERATIONS_PER_RUN
    );

    printBenchmarkResult(bigintResult);
    printBenchmarkResult(wasmResult);

    const comparison = compareBenchmarks(bigintResult, wasmResult);
    printComparison(comparison);
  });
});
