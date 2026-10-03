import { setTimeout as delay } from 'node:timers/promises';

export async function success() {
  return { ok: true };
}

export function throwFailure() {
  throw new Error('fixture threw');
}

export async function rejectFailure() {
  await delay(5);
  throw new Error('fixture rejected');
}

export async function delayTask({ task, signal }) {
  const ms = task.metadata.delayMs ?? 50;
  await delay(ms, null, { signal });
  return { delayMs: ms };
}

export async function failAfterDelay({ task, signal }) {
  const ms = task.metadata.delayMs ?? 20;
  await delay(ms, null, { signal });
  throw new Error('failed after ' + ms + 'ms');
}

export async function flaky({ task, attempt, signal }) {
  const ms = task.metadata.delayMs ?? 5;
  await delay(ms, null, { signal });
  const failuresBeforeSuccess = task.metadata.failuresBeforeSuccess ?? 1;
  if (attempt <= failuresBeforeSuccess) {
    throw new Error('deterministic flaky failure on attempt ' + attempt);
  }
  return { attempt };
}
