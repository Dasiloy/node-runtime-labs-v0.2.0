import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { runTaskWithRetries } from './runner.js';
import { evaluateMode } from './modes.js';
import { StateStore } from './state-store.js';

const TERMINAL_STATUSES = new Set(['success', 'failed', 'timed_out', 'canceled', 'blocked', 'skipped', 'interrupted']);

function now() {
  return new Date().toISOString();
}

async function writeJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function updateModesReport(reportDir, mode, entry) {
  const filePath = join(reportDir, 'modes.json');
  let current = {};
  try {
    current = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  current[mode] = entry;
  await writeJson(filePath, current);
}

function statusCounts(results) {
  const counts = {
    successCount: 0,
    failedCount: 0,
    timedOutCount: 0,
    canceledCount: 0,
    blockedCount: 0,
    skippedCount: 0,
    interruptedCount: 0
  };
  for (const result of results) {
    if (result.status === 'success') counts.successCount += 1;
    if (result.status === 'failed') counts.failedCount += 1;
    if (result.status === 'timed_out') counts.timedOutCount += 1;
    if (result.status === 'canceled') counts.canceledCount += 1;
    if (result.status === 'blocked') counts.blockedCount += 1;
    if (result.status === 'skipped') counts.skippedCount += 1;
    if (result.status === 'interrupted') counts.interruptedCount += 1;
  }
  return counts;
}

function computeRunStatus(results, stoppedReason) {
  if (stoppedReason === 'first_success') {
    return 'success';
  }
  if (stoppedReason === 'aggregate_failure') {
    return 'failed';
  }
  if (results.some((result) => result.status !== 'success')) {
    return 'failed';
  }
  return 'success';
}

function queueResult(task, status, details = {}) {
  const endedAt = now();
  return {
    taskId: task.id,
    status,
    queuedAt: details.queuedAt ?? null,
    startedAt: null,
    endedAt,
    elapsedMs: 0,
    queueMs: details.queuedAt ? Math.max(0, Date.parse(endedAt) - Date.parse(details.queuedAt)) : 0,
    ...details
  };
}

export async function runScheduledTasks(taskFile, options = {}) {
  const runtime = options.runtime;
  const mode = options.mode ?? 'allSettled';
  const concurrency = options.concurrency ?? 1;
  const reportDir = options.reportDir ?? 'reports';
  const stateDir = options.stateDir ?? 'state';
  const stateStore = options.stateStore ?? new StateStore({ filePath: join(stateDir, 'run.json') });
  const runId = randomUUID();
  const runStartedAt = now();
  const startMark = performance.now();
  const states = new Map(taskFile.tasks.map((task) => [task.id, 'pending']));
  const queuedAtById = new Map();
  const results = new Map();
  const readyQueue = [];
  const active = new Set();
  const eventLog = [];
  const canceledTaskIds = new Set();
  let activeCount = 0;
  let maxActive = 0;
  let queueLengthMax = 0;
  let startedCount = 0;
  let stoppedReason = null;
  let modeStopped = false;
  let cancelTimer = null;
  let resolved = false;
  let resolveDone;

  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const snapshot = {
    runId,
    taskFile: taskFile.filePath,
    startedAt: runStartedAt,
    updatedAt: runStartedAt,
    status: 'running',
    options: {
      concurrency,
      mode,
      timeout: options.defaultTimeoutMs ?? null,
      cancelAfterMs: options.cancelAfterMs ?? null
    },
    tasksById: {},
    events: eventLog
  };

  for (const task of taskFile.tasks) {
    snapshot.tasksById[task.id] = {
      definition: task,
      status: 'pending'
    };
  }

  async function persist() {
    snapshot.updatedAt = now();
    await stateStore.save(snapshot);
  }

  function emitLifecycle(name, payload) {
    const event = {
      type: name,
      timestamp: payload.timestamp ?? now(),
      ...payload
    };
    eventLog.push(event);
    runtime?.emit?.(name, event);
    void persist();
  }

  function setTaskState(taskId, status, extra = {}) {
    states.set(taskId, status);
    snapshot.tasksById[taskId] = {
      ...snapshot.tasksById[taskId],
      status,
      ...extra
    };
  }

  function markTerminal(task, result) {
    results.set(task.id, result);
    setTaskState(task.id, result.status, {
      result,
      attempts: result.attempts ?? []
    });
    if (result.status === 'canceled') {
      canceledTaskIds.add(task.id);
    }
    emitLifecycle('task:finish', {
      taskId: task.id,
      timestamp: now(),
      status: result.status
    });
  }

  function enqueue(task) {
    if (states.get(task.id) !== 'pending') {
      return;
    }
    const queuedAt = now();
    readyQueue.push(task);
    queuedAtById.set(task.id, queuedAt);
    setTaskState(task.id, 'queued', { queuedAt });
    queueLengthMax = Math.max(queueLengthMax, readyQueue.length);
  }

  function markBlocked(task, blockedBy) {
    if (TERMINAL_STATUSES.has(states.get(task.id))) {
      return;
    }
    const result = queueResult(task, 'blocked', {
      blockedBy,
      error: {
        kind: 'dependency_blocked',
        message: 'Dependency blocked task: ' + blockedBy.join(', ')
      }
    });
    markTerminal(task, result);
    for (const candidate of taskFile.tasks) {
      if (candidate.dependsOn.includes(task.id)) {
        markBlocked(candidate, [task.id]);
      }
    }
  }

  function enqueueReadyTasks() {
    for (const task of taskFile.tasks) {
      if (states.get(task.id) !== 'pending') {
        continue;
      }
      const dependencyResults = task.dependsOn.map((dependencyId) => results.get(dependencyId));
      const failedDependency = dependencyResults.find((result) => result && result.status !== 'success');
      if (failedDependency) {
        markBlocked(task, [failedDependency.taskId]);
        continue;
      }
      if (task.dependsOn.every((dependencyId) => results.get(dependencyId)?.status === 'success')) {
        enqueue(task);
      }
    }
  }

  function markUnstarted(status, reason) {
    for (const task of taskFile.tasks) {
      const state = states.get(task.id);
      if (state === 'pending' || state === 'queued') {
        const queuedAt = queuedAtById.get(task.id);
        const result = queueResult(task, status, {
          queuedAt,
          error: {
            kind: status,
            message: reason
          }
        });
        markTerminal(task, result);
      }
    }
    readyQueue.length = 0;
  }

  function stopForMode(reason) {
    if (modeStopped) {
      return;
    }
    modeStopped = true;
    stoppedReason = reason;
    markUnstarted('skipped', 'Run stopped by mode: ' + reason);
    runtime?.stopForMode?.(reason);
  }

  function maybeResolve() {
    const terminalCount = [...states.values()].filter((status) => TERMINAL_STATUSES.has(status)).length;
    if (!resolved && terminalCount === taskFile.tasks.length && activeCount === 0) {
      resolved = true;
      resolveDone();
    }
    if (!resolved && activeCount === 0 && readyQueue.length === 0) {
      const pending = taskFile.tasks.filter((task) => states.get(task.id) === 'pending');
      if (pending.length > 0) {
        for (const task of pending) {
          markBlocked(task, ['dependency_cycle_or_unsatisfied']);
        }
      }
      resolved = true;
      resolveDone();
    }
  }

  function pump() {
    if (runtime?.control?.stopStarting || modeStopped) {
      maybeResolve();
      return;
    }
    enqueueReadyTasks();
    while (activeCount < concurrency && readyQueue.length > 0 && !runtime?.control?.stopStarting && !modeStopped) {
      const task = readyQueue.shift();
      const queuedAt = queuedAtById.get(task.id);
      const queueStart = Date.parse(queuedAt);
      startedCount += 1;
      activeCount += 1;
      maxActive = Math.max(maxActive, activeCount);
      setTaskState(task.id, 'running', { startedAt: now() });

      const taskPromise = runTaskWithRetries(task, {
        taskFileDir: taskFile.taskFileDir,
        stateDir,
        defaultTimeoutMs: options.defaultTimeoutMs ?? null,
        signal: runtime?.signal,
        emit: emitLifecycle,
        printOutput: options.printOutput,
        killGraceMs: options.killGraceMs
      }).then((result) => {
        const startedAt = result.startedAt;
        const queueMs = startedAt ? Math.max(0, Date.parse(startedAt) - queueStart) : 0;
        return {
          ...result,
          queuedAt,
          queueMs
        };
      });

      active.add(taskPromise);
      taskPromise.then((result) => {
        active.delete(taskPromise);
        activeCount -= 1;
        markTerminal(task, result);
        if (result.status !== 'success') {
          for (const candidate of taskFile.tasks) {
            if (candidate.dependsOn.includes(task.id)) {
              markBlocked(candidate, [task.id]);
            }
          }
        }
        const decision = evaluateMode({
          mode,
          latestResult: result,
          results,
          taskCount: taskFile.tasks.length,
          stopped: stoppedReason
        });
        if (decision.stop && decision.reason && !modeStopped && decision.reason !== 'aggregate_failure') {
          stopForMode(decision.reason);
        } else if (decision.reason === 'aggregate_failure') {
          stoppedReason = decision.reason;
        }

        pump();
        maybeResolve();
      }).catch((error) => {
        active.delete(taskPromise);
        activeCount -= 1;
        markTerminal(task, queueResult(task, 'failed', {
          queuedAt,
          error: {
            kind: 'runtime_error',
            message: error.message,
            stack: error.stack
          }
        }));
        pump();
        maybeResolve();
      });
    }
    maybeResolve();
  }

  runtime?.on?.('run:cancel', (event) => {
    snapshot.canceledAt = event.canceledAt;
    snapshot.cancelReason = event.reason;
    markUnstarted('canceled', event.reason);
    pump();
    maybeResolve();
  });

  if (options.cancelAfterMs !== null && options.cancelAfterMs !== undefined) {
    cancelTimer = setTimeout(() => {
      runtime?.cancel('cancel-after:' + options.cancelAfterMs + 'ms');
    }, options.cancelAfterMs);
    cancelTimer.unref?.();
  }

  await persist();
  pump();
  await done;

  if (cancelTimer) {
    clearTimeout(cancelTimer);
  }
  await Promise.allSettled([...active]);

  if (mode === 'any' && !stoppedReason && ![...results.values()].some((result) => result.status === 'success')) {
    stoppedReason = 'aggregate_failure';
  }

  const orderedResults = taskFile.tasks.map((task) => results.get(task.id)).filter(Boolean);
  const runEndedAt = now();
  const counts = statusCounts(orderedResults);
  const report = {
    run: {
      runId,
      taskFile: taskFile.filePath,
      mode,
      status: computeRunStatus(orderedResults, stoppedReason),
      startedAt: runStartedAt,
      endedAt: runEndedAt,
      elapsedMs: Math.max(0, performance.now() - startMark),
      stoppedReason,
      canceledAt: snapshot.canceledAt ?? null,
      cancelReason: snapshot.cancelReason ?? null,
      canceledTaskIds: [...canceledTaskIds]
    },
    metrics: {
      taskCount: taskFile.tasks.length,
      completedCount: counts.successCount,
      failedCount: counts.failedCount,
      timedOutCount: counts.timedOutCount,
      canceledCount: counts.canceledCount,
      blockedCount: counts.blockedCount,
      skippedCount: counts.skippedCount,
      startedCount,
      settledCount: orderedResults.length,
      retryCount: orderedResults.reduce((total, result) => total + Math.max(0, (result.attemptCount ?? 1) - 1), 0),
      maxActive,
      queueLengthMax,
      ...counts
    },
    tasks: orderedResults
  };

  if (stoppedReason === 'aggregate_failure') {
    report.run.aggregateError = {
      name: 'AggregateError',
      message: 'Every candidate failed before any task succeeded'
    };
  }

  snapshot.status = report.run.status;
  snapshot.endedAt = runEndedAt;
  snapshot.report = report;
  await persist();

  if (options.writeReports !== false) {
    await writeJson(join(reportDir, 'latest.json'), report);
    await updateModesReport(reportDir, mode, {
      mode,
      taskFile: taskFile.filePath,
      startedCount,
      settledCount: orderedResults.length,
      stoppedReason,
      finalStatusCounts: counts,
      maxActive,
      queueLengthMax
    });
  }

  runtime?.emit?.('run:finish', {
    timestamp: now(),
    status: report.run.status,
    report
  });

  return report;
}

