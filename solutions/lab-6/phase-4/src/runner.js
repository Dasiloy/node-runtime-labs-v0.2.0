import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
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

async function runCommandTask(task, context, base, startMark) {
  return await new Promise((resolve) => {
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let spawnError = null;

    const child = spawn(task.command, task.args, {
      cwd: context.cwd ?? process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

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
      const evidence = { exitCode, signal, stdoutBytes, stderrBytes };
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

async function runFunctionTask(task, context, base, startMark) {
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
      attempt: context.attempt ?? 1,
      metadata: task.metadata,
      stateDir: context.stateDir,
      taskFileDir: context.taskFileDir
    });
  } catch (error) {
    return finishResult(base, startMark, {
      status: 'failed',
      error: serializeError(error, 'thrown')
    });
  }

  try {
    await returned;
  } catch (error) {
    return finishResult(base, startMark, {
      status: 'failed',
      error: serializeError(error, 'rejected')
    });
  }

  return finishResult(base, startMark, {
    status: 'success'
  });
}

export async function runTask(task, context = {}) {
  const startedAt = now();
  const startMark = performance.now();
  const base = {
    taskId: task.id,
    attempt: context.attempt ?? 1,
    startedAt
  };

  if (task.type === 'command') {
    return await runCommandTask(task, context, base, startMark);
  }

  if (task.type === 'function') {
    return await runFunctionTask(task, context, base, startMark);
  }

  return finishResult(base, startMark, {
    status: 'failed',
    error: {
      kind: 'unsupported_task_type',
      message: 'Unsupported task type: ' + task.type
    }
  });
}

