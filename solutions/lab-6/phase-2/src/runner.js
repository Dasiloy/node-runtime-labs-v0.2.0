import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

function now() {
  return new Date().toISOString();
}

function finishResult(base, startMark, fields) {
  return {
    ...base,
    ...fields,
    endedAt: now(),
    elapsedMs: Math.max(0, performance.now() - startMark)
  };
}

export async function runTask(task, context = {}) {
  const startedAt = now();
  const startMark = performance.now();
  const base = {
    taskId: task.id,
    attempt: context.attempt ?? 1,
    startedAt
  };

  if (task.type !== 'command') {
    return finishResult(base, startMark, {
      status: 'failed',
      error: {
        kind: 'unsupported_task_type',
        message: 'Phase 2 supports command tasks only'
      }
    });
  }

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
          error: {
            kind: 'spawn_error',
            message: spawnError.message
          }
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

