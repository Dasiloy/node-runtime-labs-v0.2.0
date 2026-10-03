import { dirname, resolve } from 'node:path';

export const TASK_TYPES = new Set(['command', 'function']);
export const TASK_FIELDS = [
  'id',
  'type',
  'command',
  'args',
  'module',
  'export',
  'timeoutMs',
  'retries',
  'dependsOn',
  'metadata'
];

export class TaskFormatError extends Error {
  constructor(errors) {
    super(errors.join('\n'));
    this.name = 'TaskFormatError';
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateString(value, field, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(field + ' must be a non-empty string');
    return null;
  }

  return value;
}

function validateStringArray(value, field, errors, fallback = []) {
  if (value === undefined) {
    return fallback;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    errors.push(field + ' must be an array of non-empty strings');
    return fallback;
  }

  return value;
}

function validateOptionalInteger(value, field, errors, { min = 0 } = {}) {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < min) {
    errors.push(field + ' must be an integer >= ' + min);
    return undefined;
  }

  return value;
}

function normalizeRetries(value, field, errors) {
  if (value === undefined) {
    return { maxAttempts: 1, backoffMs: 0, factor: 1, retryOn: null };
  }

  if (!isPlainObject(value)) {
    errors.push(field + ' must be an object');
    return { maxAttempts: 1, backoffMs: 0, factor: 1, retryOn: null };
  }

  const maxAttempts = value.maxAttempts === undefined ? 1 : value.maxAttempts;
  const backoffMs = value.backoffMs === undefined ? 0 : value.backoffMs;
  const factor = value.factor === undefined ? 1 : value.factor;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    errors.push(field + '.maxAttempts must be an integer >= 1');
  }

  if (!Number.isInteger(backoffMs) || backoffMs < 0) {
    errors.push(field + '.backoffMs must be an integer >= 0');
  }

  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 1) {
    errors.push(field + '.factor must be a number >= 1');
  }

  let retryOn = null;
  if (value.retryOn !== undefined) {
    retryOn = validateStringArray(value.retryOn, field + '.retryOn', errors, null);
  }

  return {
    maxAttempts: Number.isInteger(maxAttempts) && maxAttempts >= 1 ? maxAttempts : 1,
    backoffMs: Number.isInteger(backoffMs) && backoffMs >= 0 ? backoffMs : 0,
    factor: typeof factor === 'number' && Number.isFinite(factor) && factor >= 1 ? factor : 1,
    retryOn
  };
}

function normalizeTask(rawTask, index, errors) {
  const field = 'tasks[' + index + ']';

  if (!isPlainObject(rawTask)) {
    errors.push(field + ' must be an object');
    return null;
  }

  const id = validateString(rawTask.id, field + '.id', errors);
  const type = validateString(rawTask.type, field + '.type', errors);

  if (type && !TASK_TYPES.has(type)) {
    errors.push(field + '.type must be one of: command, function');
  }

  const timeoutMs = validateOptionalInteger(rawTask.timeoutMs, field + '.timeoutMs', errors, { min: 1 });
  const dependsOn = validateStringArray(rawTask.dependsOn, field + '.dependsOn', errors, []);
  const args = validateStringArray(rawTask.args, field + '.args', errors, []);

  if (rawTask.metadata !== undefined && !isPlainObject(rawTask.metadata)) {
    errors.push(field + '.metadata must be an object');
  }

  let command = null;
  let modulePath = null;
  let exportName = null;

  if (type === 'command') {
    command = validateString(rawTask.command, field + '.command', errors);
  }

  if (type === 'function') {
    modulePath = validateString(rawTask.module, field + '.module', errors);
    exportName = validateString(rawTask.export, field + '.export', errors);
  }

  return {
    id: id ?? field,
    type,
    command,
    args,
    module: modulePath,
    export: exportName,
    timeoutMs,
    retries: normalizeRetries(rawTask.retries, field + '.retries', errors),
    dependsOn,
    metadata: rawTask.metadata ?? {}
  };
}

export function normalizeTaskFile(raw, { filePath = '' } = {}) {
  const errors = [];

  if (!isPlainObject(raw)) {
    throw new TaskFormatError(['task file must be a top-level object']);
  }

  if (raw.version === undefined) {
    errors.push('version is required');
  }

  if (!Array.isArray(raw.tasks)) {
    errors.push('tasks is required and must be an array');
  }

  if (raw.metadata !== undefined && !isPlainObject(raw.metadata)) {
    errors.push('metadata must be an object');
  }

  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map((task, index) => normalizeTask(task, index, errors)).filter(Boolean)
    : [];

  const ids = new Set();
  for (const task of tasks) {
    if (ids.has(task.id)) {
      errors.push('duplicate task id: ' + task.id);
    }
    ids.add(task.id);
  }

  for (const task of tasks) {
    for (const dependencyId of task.dependsOn) {
      if (!ids.has(dependencyId)) {
        errors.push('task ' + task.id + ' depends on missing task id: ' + dependencyId);
      }
    }
  }

  if (errors.length > 0) {
    throw new TaskFormatError(errors);
  }

  const absolutePath = filePath ? resolve(filePath) : '';

  return {
    version: raw.version,
    metadata: raw.metadata ?? {},
    tasks,
    filePath: absolutePath,
    taskFileDir: absolutePath ? dirname(absolutePath) : process.cwd()
  };
}
