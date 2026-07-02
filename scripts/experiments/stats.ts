/** Summary statistics helpers used across the experiment scripts. */

export type Summary = {
  n: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  sd: number;
  /** Half-width of the 95% confidence interval on the mean. */
  ci95: number;
};

/** Linear-interpolated percentile (q in [0,1]) over a numeric sample. */
export function percentile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Sample standard deviation (n-1 denominator). */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function summarize(values: number[]): Summary {
  const n = values.length;
  const sd = stddev(values);
  return {
    n,
    mean: mean(values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    min: n ? Math.min(...values) : NaN,
    max: n ? Math.max(...values) : NaN,
    sd,
    // 1.96 * SE for a large-sample normal approximation of the 95% CI.
    ci95: n > 1 ? (1.96 * sd) / Math.sqrt(n) : 0,
  };
}

/**
 * Gini coefficient of a non-negative distribution (0 = perfectly equal,
 * 1 = maximally unequal). Used to quantify how evenly dispatch load is
 * spread across the worker pool.
 */
export function gini(values: number[]): number {
  const xs = values.filter((v) => v >= 0);
  const n = xs.length;
  if (n === 0) return 0;
  const total = xs.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * sorted[i]!;
  return (2 * cum) / (n * total) - (n + 1) / n;
}

export function round(value: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}
