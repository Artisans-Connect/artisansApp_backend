/**
 * Dependency-free Hungarian (Kuhn–Munkres) algorithm for optimal assignment.
 *
 * Used only as an experimental *upper bound*: given a batch of open jobs and
 * available workers scored by the ranking model, the greedy per-job dispatch
 * the platform actually runs may leave value on the table. The Hungarian
 * optimum bounds that gap, quantifying how much a globally-optimal batch
 * matcher would gain over the deployed greedy heuristic.
 *
 * Implementation: O(n^3) min-cost assignment on a square padded matrix.
 * We maximise total score by minimising (BIG - score).
 */

const BIG = 1e9;

/**
 * @param scores scores[i][j] = value of assigning row i (job) to col j (worker).
 * @returns assignment[i] = column assigned to row i, or -1 if none; plus total score.
 */
export function maximizeAssignment(scores: number[][]): { assignment: number[]; total: number } {
  const rows = scores.length;
  const cols = rows === 0 ? 0 : scores[0]!.length;
  if (rows === 0 || cols === 0) return { assignment: new Array(rows).fill(-1), total: 0 };

  const n = Math.max(rows, cols);
  // Cost matrix padded to square; missing cells cost BIG (score 0).
  const cost: number[][] = [];
  for (let i = 0; i < n; i++) {
    cost[i] = [];
    for (let j = 0; j < n; j++) {
      const s = i < rows && j < cols ? scores[i]![j]! : 0;
      cost[i]![j] = BIG - s;
    }
  }

  // Jonker-style potentials / augmenting path (1-indexed internals).
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[j] = row matched to column j
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1]![j - 1]! - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const assignment = new Array(rows).fill(-1);
  let total = 0;
  for (let j = 1; j <= n; j++) {
    const i = p[j];
    if (i >= 1 && i <= rows && j <= cols) {
      assignment[i - 1] = j - 1;
      total += scores[i - 1]![j - 1]!;
    }
  }
  return { assignment, total };
}
