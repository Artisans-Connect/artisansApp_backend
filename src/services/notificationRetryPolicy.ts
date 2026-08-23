export function retryDelays(maxAttempts: number, baseDelayMs = 1000): number[] {
  return Array.from({ length: Math.max(0, maxAttempts - 1) }, (_, index) => baseDelayMs * 2 ** index);
}
