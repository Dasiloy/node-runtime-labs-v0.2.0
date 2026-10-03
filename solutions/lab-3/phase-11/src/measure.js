import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const memoryKeys = ['rss', 'heapUsed', 'heapTotal', 'external', 'arrayBuffers'];

function normalizeMemory(sample) {
  const normalized = {};

  for (const key of memoryKeys) {
    normalized[key] = sample[key] ?? 0;
  }

  return normalized;
}

function maxMemory(left, right) {
  const peak = {};

  for (const key of memoryKeys) {
    peak[key] = Math.max(left[key] ?? 0, right[key] ?? 0);
  }

  return peak;
}

export function createTimer() {
  const startMs = performance.now();
  const startedAt = new Date();

  return {
    end() {
      const endMs = performance.now();

      return {
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        elapsedMs: endMs - startMs,
      };
    },
  };
}

export function createMemorySampler(intervalMs = 100) {
  let current = normalizeMemory(process.memoryUsage());
  let peak = { ...current };
  let stopped = false;

  const sample = () => {
    current = normalizeMemory(process.memoryUsage());
    peak = maxMemory(peak, current);
  };

  const interval = setInterval(sample, intervalMs);
  interval.unref();

  return {
    sample,
    stop() {
      if (!stopped) {
        clearInterval(interval);
        stopped = true;
      }
      sample();
      return {
        current: { ...current },
        peak: { ...peak },
      };
    },
  };
}

export function createByteCounters(initial = {}) {
  const counters = {
    read: 0,
    written: 0,
    ...initial,
  };

  return {
    add(name, bytes) {
      counters[name] = (counters[name] ?? 0) + bytes;
    },
    snapshot() {
      return { ...counters };
    },
  };
}

export function createReport({ mode, status = 'completed', input, output, counts, timing, memory, bytes, details = {} }) {
  return {
    mode,
    status,
    input,
    output,
    counts,
    timing,
    memory,
    bytes,
    details,
  };
}

export async function writeJsonReport(reportPath, report) {
  const absolutePath = resolve(reportPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
}
