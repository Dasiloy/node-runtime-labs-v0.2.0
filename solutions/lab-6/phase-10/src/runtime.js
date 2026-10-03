import { EventEmitter } from 'node:events';
import { runScheduledTasks } from './scheduler.js';

function now() {
  return new Date().toISOString();
}

export class TaskRuntime extends EventEmitter {
  constructor(taskFile, { options = {} } = {}) {
    super();
    this.taskFile = taskFile;
    this.options = options;
    this.controller = new AbortController();
    this.control = {
      stopStarting: false,
      canceledAt: null,
      cancelReason: null
    };
  }

  get signal() {
    return this.controller.signal;
  }

  cancel(reason = 'requested') {
    if (this.control.canceledAt) {
      return false;
    }
    const canceledAt = now();
    this.control.stopStarting = true;
    this.control.canceledAt = canceledAt;
    this.control.cancelReason = reason;
    if (!this.controller.signal.aborted) {
      this.controller.abort({
        kind: 'canceled',
        message: reason,
        canceledAt
      });
    }
    this.emit('run:cancel', { canceledAt, reason });
    return true;
  }

  stopForMode(reason) {
    this.control.stopStarting = true;
    if (!this.controller.signal.aborted) {
      this.controller.abort({
        kind: 'mode_stop',
        message: reason,
        canceledAt: now()
      });
    }
  }


  async start() {
    return await runScheduledTasks(this.taskFile, {
      ...this.options,
      runtime: this,
      signal: this.signal
    });
  }
}

