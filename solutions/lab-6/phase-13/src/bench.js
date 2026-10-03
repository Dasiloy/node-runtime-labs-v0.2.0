import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform } from 'node:os';
import { performance } from 'node:perf_hooks';
import { join, resolve } from 'node:path';
import { normalizeTaskFile } from './task-format.js';
import { loadTaskFile } from './load-tasks.js';
import { TaskRuntime } from './runtime.js';

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function delayTasks(count, delayMs) {
  return Array.from({ length: count }, (_, index) => ({
    id: 'bench-delay-' + index,
    type: 'function',
    module: '../fixtures.js',
    export: 'delayTask',
    metadata: { delayMs }
  }));
}

async function makeTaskFile(name, tasks) {
  const filePath = resolve('tasks/bench/' + name + '.json');
  const raw = { version: 1, tasks };
  await mkdir('tasks/bench', { recursive: true });
  await writeFile(filePath, JSON.stringify(raw, null, 2) + '\n');
  return normalizeTaskFile(raw, { filePath });
}

async function runScenario(name, command, taskFile, options) {
  console.log('Scenario: ' + name);
  const runtime = new TaskRuntime(taskFile, {
    options: {
      printOutput: false,
      reportDir: 'reports/bench-runs/' + name,
      stateDir: 'state/bench-runs/' + name,
      ...options
    }
  });
  const start = performance.now();
  const report = await runtime.start();
  const durationMs = performance.now() - start;
  const queueValues = report.tasks.map((task) => task.queueMs ?? 0);

  return {
    name,
    command,
    durationMs,
    throughputPerSecond: report.metrics.taskCount / (durationMs / 1000),
    successCount: report.metrics.successCount,
    failedCount: report.metrics.failedCount,
    timedOutCount: report.metrics.timedOutCount,
    canceledCount: report.metrics.canceledCount,
    retryCount: report.metrics.retryCount,
    queueMsAvg: queueValues.reduce((total, value) => total + value, 0) / Math.max(1, queueValues.length),
    queueMsP95: percentile(queueValues, 95),
    maxActive: report.metrics.maxActive,
    stoppedReason: report.run.stoppedReason,
    status: report.run.status
  };
}

function markdown(results) {
  const lines = [
    '# Task Runtime Benchmark',
    '',
    '- Command: npm run bench',
    '- Node: ' + process.version,
    '- Platform: ' + platform(),
    '- CPU count: ' + cpus().length,
    '- Task mix: deterministic delay, timeout, flaky retry, and mixed-result mode scenarios.',
    '',
    '| Scenario | Duration ms | Throughput/s | Success | Failed | Timed out | Canceled | Retries | Queue avg ms | Queue p95 ms | Max active | Stop reason |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |'
  ];

  for (const result of results) {
    lines.push([
      result.name,
      result.durationMs.toFixed(1),
      result.throughputPerSecond.toFixed(2),
      result.successCount,
      result.failedCount,
      result.timedOutCount,
      result.canceledCount,
      result.retryCount,
      result.queueMsAvg.toFixed(1),
      result.queueMsP95.toFixed(1),
      result.maxActive,
      result.stoppedReason ?? ''
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('');
  lines.push('Concurrency changes queue time and throughput because the scheduler admits more active attempts before waiting for completions.');
  lines.push('Timeout and retry scenarios change outcome counts and latency because attempts can end early or run again after backoff.');
  lines.push('Mode scenarios change how much work starts before the aggregate result is decided.');
  return lines.join('\n') + '\n';
}

const results = [];
const concurrencyTasks = await makeTaskFile('concurrency', delayTasks(40, 30));
for (const concurrency of [1, 5, 20]) {
  results.push(await runScenario(
    'concurrency-' + concurrency,
    'runtime(concurrency=' + concurrency + ')',
    concurrencyTasks,
    { concurrency }
  ));
}

const timeoutTasks = await makeTaskFile('timeouts', [
  { id: 'short', type: 'function', module: '../fixtures.js', export: 'delayTask', metadata: { delayMs: 10 } },
  { id: 'long-a', type: 'function', module: '../fixtures.js', export: 'delayTask', metadata: { delayMs: 100 } },
  { id: 'long-b', type: 'function', module: '../fixtures.js', export: 'delayTask', metadata: { delayMs: 100 } }
]);
results.push(await runScenario('timeout-none', 'runtime(timeout=null)', timeoutTasks, { concurrency: 3 }));
results.push(await runScenario('timeout-short', 'runtime(timeout=30)', timeoutTasks, { concurrency: 3, defaultTimeoutMs: 30 }));

const retryDisabled = await makeTaskFile('retry-disabled', [
  { id: 'no-retry', type: 'function', module: '../fixtures.js', export: 'flaky', retries: { maxAttempts: 1, backoffMs: 0 }, metadata: { failuresBeforeSuccess: 1, delayMs: 1 } }
]);
const retryEnabled = await makeTaskFile('retry-enabled', [
  { id: 'retry', type: 'function', module: '../fixtures.js', export: 'flaky', retries: { maxAttempts: 2, backoffMs: 10 }, metadata: { failuresBeforeSuccess: 1, delayMs: 1 } }
]);
results.push(await runScenario('retry-disabled', 'runtime(retries=disabled)', retryDisabled, { concurrency: 1 }));
results.push(await runScenario('retry-enabled', 'runtime(retries=enabled)', retryEnabled, { concurrency: 1 }));

const mixed = await loadTaskFile('tasks/mixed-results.json');
for (const mode of ['all', 'allSettled', 'race', 'any']) {
  results.push(await runScenario('mode-' + mode, 'runtime(mode=' + mode + ')', mixed, { concurrency: 3, mode }));
}

await mkdir('reports', { recursive: true });
await writeFile('reports/bench.json', JSON.stringify(results, null, 2) + '\n');
await writeFile('reports/task-runtime.md', markdown(results));

console.log('Wrote reports/bench.json');
console.log('Wrote reports/task-runtime.md');
