import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTaskFile } from '../src/load-tasks.js';
import { TaskRuntime } from '../src/runtime.js';
import { StateStore } from '../src/state-store.js';
import { applyShutdownDecision } from '../src/shutdown.js';

test('successful task events stay in lifecycle order', async () => {
  const taskFile = await loadTaskFile('tasks/function-success.json');
  const runtime = new TaskRuntime(taskFile, {
    options: {
      printOutput: false,
      reportDir: 'reports/test-success',
      stateDir: 'state/test-success'
    }
  });
  const events = [];
  for (const name of ['task:start', 'task:success', 'task:finish', 'error']) {
    runtime.on(name, (event) => events.push([name, event.taskId]));
  }
  const report = await runtime.start();
  assert.equal(report.run.status, 'success');
  assert.deepEqual(events.map(([name]) => name), ['task:start', 'task:success', 'task:finish']);
});

test('retried task emits failure, retry, second start, success, finish', async () => {
  const taskFile = await loadTaskFile('tasks/flaky-success.json');
  const runtime = new TaskRuntime(taskFile, {
    options: {
      printOutput: false,
      reportDir: 'reports/test-retry',
      stateDir: 'state/test-retry'
    }
  });
  const events = [];
  for (const name of ['task:start', 'task:failure', 'task:retry', 'task:success', 'task:finish']) {
    runtime.on(name, () => events.push(name));
  }
  const report = await runtime.start();
  assert.equal(report.run.status, 'success');
  assert.deepEqual(events, ['task:start', 'task:failure', 'task:retry', 'task:start', 'task:success', 'task:finish']);
});

test('ordinary task failures do not use the generic error event', async () => {
  const taskFile = await loadTaskFile('tasks/function-failure.json');
  const runtime = new TaskRuntime(taskFile, {
    options: {
      printOutput: false,
      reportDir: 'reports/test-failure',
      stateDir: 'state/test-failure'
    }
  });
  let genericErrorFired = false;
  let taskFailureCount = 0;
  runtime.on('error', () => {
    genericErrorFired = true;
  });
  runtime.on('task:failure', () => {
    taskFailureCount += 1;
  });
  const report = await runtime.start();
  assert.equal(report.run.status, 'failed');
  assert.equal(genericErrorFired, false);
  assert.equal(taskFailureCount, 2);
});

test('state store saves and loads snapshots atomically', async () => {
  const store = new StateStore({ filePath: 'state/test-store/run.json' });
  const snapshot = {
    runId: 'test-run',
    taskFile: 'tasks/function-success.json',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'running',
    options: {},
    tasksById: {},
    events: []
  };
  await store.save(snapshot);
  const loaded = await store.load();
  assert.equal(loaded.runId, snapshot.runId);
  assert.equal(loaded.status, snapshot.status);
});

test('shutdown decisions cover drain, cancel, queued work, and second signal', () => {
  const tasksById = {
    queued: { status: 'queued' },
    running: { status: 'running' },
    done: { status: 'success' }
  };
  const drain = applyShutdownDecision(tasksById, { mode: 'drain' });
  assert.equal(drain.tasksById.queued.status, 'canceled');
  assert.equal(drain.tasksById.running.status, 'running');
  assert.ok(drain.decisions.includes('drain_running:running'));
  const cancel = applyShutdownDecision(tasksById, { mode: 'cancel' });
  assert.equal(cancel.tasksById.queued.status, 'canceled');
  assert.equal(cancel.tasksById.running.status, 'canceled');
  assert.ok(cancel.decisions.includes('cancel_running:running'));
  const forced = applyShutdownDecision(tasksById, { secondSignal: true });
  assert.equal(forced.forced, true);
  assert.equal(forced.exitCode, 130);
});


