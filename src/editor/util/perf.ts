export function nowMs() {
  return performance.now();
}

export function measure<T>(label: string, fn: () => T): T {
  const t0 = nowMs();
  try {
    return fn();
  } finally {
    const t1 = nowMs();
    // eslint-disable-next-line no-console
    console.debug(`[perf] ${label}: ${(t1 - t0).toFixed(1)}ms`);
  }
}
