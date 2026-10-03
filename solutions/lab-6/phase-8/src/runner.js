import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

function now() {
  return new Date().toISOString();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function serializeError(error, kind, extra = {}) {
  const serialized = {
    kind,
    message: errorMessage(error),
    ...extra
  };

  if (error instanceof Error && error.stack) {
    serialized.stack = error.stack;
  }

  return serialized;
}

function finishResult(base, startMark, fields) {
  return {
    ...base,
    ...fields,
    endedAt: now(),
    elapsedMs: Math.max(0, performance.now() - startMark)
  };
}

function createAttemptSignal(context, effectiveTimeoutMs) {
  const controller = new AbortController();
  let abortCause = null;
  let timeoutTimer = null;

  const abort = (cause) => {
    if (abortCause) {
      return;
    }
    abortCause = cause;
    controller.abort(cause);
  };

  const runSignal = context.signal;
  const onRunAbort = () => {
    const reason = runSignal?.reason;
    abort({
      kind: 'canceled',
      message: reason?.message ?? 'Run canceled',
      canceledAt: reason?.canceledAt ?? now()
    });
  };

  if (runSignal?.aborted) {
    onRunAbort();
  } else if (runSignal) {
    runSignal.addEventListener('abort', onRunAbort, { once: true });
  }

  if (effectiveTimeoutMs !== null && effectiveTimeoutMs !== undefined) {
    timeoutTimer = setTimeout(() => {
      abort({
        kind: 'timeout',
        message: 'Task exceeded timeout of ' + effectiveTimeoutMs + 'ms',
        timedOutAt: now()
      });
    }, effectiveTimeoutMs);
    timeoutTimer.unref?.();
  }

  return {
    signal: controller.signal,
    getAbortCause: () => abortCause,
    cleanup: () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      if (runSignal) {
        runSignal.removeEventListener('abort', onRunAbort);
      }
    }
  };
}

function abortedResult(base, startMark, cause) {
  if (cause?.kind === 'timeout') {
    return finishResult(base, startMark, {
      status: 'timed_out',
      timedOutAt: cause.timedOutAt,
      error: {
        kind: 'timeout',
        message: cause.message
      }
    });
  }

  return finishResult(base, startMark, {
    status: 'canceled',
    canceledAt: cause?.canceledAt ?? now(),
    error: {
      kind: 'canceled',
      message: cause?.message ?? 'Task canceled'
    }
  });
}

async function runCommandTask(task, context, base, startMark, attemptSignal) {
  return await new Promise((resolve) => {
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let spawnError = null;
    let closed = false;
    let killTimer = null;

    const child = spawn(task.command, task.args, {
      cwd: context.cwd ?? process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const terminateChild = () => {
      const cause = attemptSignal.getAbortCause();
      if (!cause || closed || !child.pid) {
        return;
      }
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (!closed) {
          child.kill('SIGKILL');
        }
      }, context.killGraceMs ?? 100);
      killTimer.unref?.();
    };

    if (attemptSignal.signal.aborted) {
      terminateChild();
    } else {
      attemptSignal.signal.addEventListener('abort', terminateChild, { once: true });
    }

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.byteLength;
      if (context.printOutput !== false) {
        process.stdout.write(chunk);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.byteLength;
      if (context.printOutput !== false) {
        process.stderr.write(chunk);
      }
    });

    child.once('error', (error) => {
      spawnError = error;
    });

    child.once('close', (exitCode, signal) => {
      closed = true;
      if (killTimer) {
        clearTimeout(killTimer);
      }
      attemptSignal.signal.removeEventListener('abort', terminateChild);

      const evidence = { exitCode, signal, stdoutBytes, stderrBytes };
      const abortCause = attemptSignal.getAbortCause();
      if (abortCause) {
        resolve(finishResult(abortedResult(base, startMark, abortCause), startMark, evidence));
        return;
      }

      if (spawnError) {
        resolve(finishResult(base, startMark, {
          status: 'failed',
          ...evidence,
          error: serializeError(spawnError, 'spawn_error')
        }));
        return;
      }

      if (exitCode === 0) {
        resolve(finishResult(base, startMark, {
          status: 'success',
          ...evidence
        }));
        return;
      }

      resolve(finishResult(base, startMark, {
        status: 'failed',
        ...evidence,
        error: {
          kind: 'non_zero_exit',
          message: 'Command exited with code ' + exitCode,
          exitCode,
          signal
        }
      }));
    });
  });
}

async function runFunctionTask(task, context, base, startMark, attemptSignal) {
  const moduleUrl = new URL(task.module, pathToFileURL(context.taskFileDir + '/'));
  let returned;

  try {
    const module = await import(moduleUrl.href);
    const taskFunction = module[task.export];
    if (typeof taskFunction !== 'function') {
      throw new TypeError('Export ' + task.export + ' is not a function');
    }
    returned = taskFunction({
      task,
      signal: attemptSignal.signal,
      attempt: context.attempt ?? 1,
      metadata: task.metadata,
      stateDir: context.stateDir,
      taskFileDir: context.taskFileDir
    });
  } catch (error) {
    const abortCause = attemptSignal.getAbortCause();
    if (abortCause) {
      return abortedResult(base, startMark, abortCause);
    }
    return finishResult(base, startMark, {
      status: 'failed',
      error: serializeError(error, 'thrown')
    });
  }

  try {
    await returned;
  } catch (error) {
    const abortCause = attemptSignal.getAbortCause();
    if (abortCause) {
      return abortedResult(base, startMark, abortCause);
    }
    return finishResult(base, startMark, {
      status: 'failed',
      error: serializeError(error, 'rejected')
    });
  }

  const abortCause = attemptSignal.getAbortCause();
  if (abortCause) {
    return abortedResult(base, startMark, abortCause);
  }

  return finishResult(base, startMark, {
    status: 'success'
  });
}

export async function runTask(task, context = {}) {
  const startedAt = now();
  const startMark = performance.now();
  const effectiveTimeoutMs = task.timeoutMs ?? context.defaultTimeoutMs ?? null;
  const attemptSignal = createAttemptSignal(context, effectiveTimeoutMs);
  const base = {
    taskId: task.id,
    attempt: context.attempt ?? 1,
    startedAt,
    timeoutMs: effectiveTimeoutMs
  };

  try {
    if (task.type === 'command') {
      return await runCommandTask(task, context, base, startMark, attemptSignal);
    }
    if (task.type === 'function') {
      return await runFunctionTask(task, context, base, startMark, attemptSignal);
    }
    return finishResult(base, startMark, {
      status: 'failed',
      error: {
        kind: 'unsupported_task_type',
        message: 'Unsupported task type: ' + task.type
      }
    });
  } finally {
    attemptSignal.cleanup();
  }
}


function shouldRetry(result, policy) {
  if (result.status === 'success' || result.status === 'canceled') {
    return false;
  }
  if (policy.retryOn === null) {
    return result.status === 'failed' || result.status === 'timed_out';
  }
  return policy.retryOn.includes(result.status) || policy.retryOn.includes(result.error?.kind);
}

async function waitForBackoff(ms, signal) {
  if (ms <= 0) {
    return true;
  }
  try {
    await delay(ms, null, { signal });
    return true;
  } catch {
    return false;
  }
}

export async function runTaskWithRetries(task, context = {}) {
  const policy = task.retries ?? { maxAttempts: 1, backoffMs: 0, factor: 1, retryOn: null };
  const attempts = [];
  let nextDelayMs = policy.backoffMs;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {

    const result = await runTask(task, {
      ...context,
      attempt
    });
    const attemptResult = { ...result };
    attempts.push(attemptResult);

    if (result.status === 'success') {

      return {
        ...result,
        attempts,
        attemptCount: attempts.length
      };
    }


    const retryable = attempt < policy.maxAttempts && shouldRetry(result, policy);
    if (!retryable) {
      return {
        ...result,
        attempts,
        attemptCount: attempts.length
      };
    }

    attemptResult.nextDelayMs = nextDelayMs;

    const waited = await waitForBackoff(nextDelayMs, context.signal);
    if (!waited) {
      const canceledAt = now();
      return {
        taskId: task.id,
        attempt,
        status: 'canceled',
        startedAt: result.startedAt,
        endedAt: canceledAt,
        elapsedMs: result.elapsedMs,
        canceledAt,
        error: {
          kind: 'canceled',
          message: 'Run canceled during retry backoff'
        },
        attempts,
        attemptCount: attempts.length
      };
    }

    nextDelayMs = Math.round(nextDelayMs * policy.factor);
  }

  return attempts.at(-1);
}


