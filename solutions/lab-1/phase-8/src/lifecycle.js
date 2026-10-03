import { performance } from "node:perf_hooks";

export function startLifecycle() {
  return {
    record: {
      pid: undefined,
      startedAt: new Date().toISOString(),
      exitedAt: undefined,
      exitCode: undefined,
      signal: undefined,
      elapsedMs: undefined,
    },
    startedAtMs: performance.now(),
  };
}

export function finishLifecycle(lifecycle, { exitCode, signal }) {
  lifecycle.record.exitedAt = new Date().toISOString();
  lifecycle.record.exitCode = exitCode;
  lifecycle.record.signal = signal;
  lifecycle.record.elapsedMs = Number((performance.now() - lifecycle.startedAtMs).toFixed(3));
  return lifecycle.record;
}
