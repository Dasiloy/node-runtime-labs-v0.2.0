import { readFile } from 'node:fs/promises';
import { normalizeTaskFile, TaskFormatError } from './task-format.js';

export class TaskLoadError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'TaskLoadError';
    this.cause = options.cause;
    this.errors = options.errors;
  }
}

export async function loadTaskFile(filePath) {
  let rawText;

  try {
    rawText = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new TaskLoadError('Failed to read task file ' + filePath + ': ' + error.message, { cause: error });
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new TaskLoadError('Failed to parse task file ' + filePath + ': ' + error.message, { cause: error });
  }

  try {
    return normalizeTaskFile(parsed, { filePath });
  } catch (error) {
    if (error instanceof TaskFormatError) {
      throw new TaskLoadError('Invalid task file ' + filePath + ':\n' + error.message, {
        cause: error,
        errors: error.errors
      });
    }

    throw error;
  }
}
