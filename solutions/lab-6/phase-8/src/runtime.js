import { runScheduledTasks } from './scheduler.js';

function now() {
  return new Date().toISOString();
}

export class TaskRuntime {
  constructor(taskFile, { options = {} } = {}) {
    this.taskFile = taskFile;
    this.options = options;
    this.controller = new AbortController();
    this.handlers = new Map();
    this.control = {
      stopStarting: false,
      canceledAt: null,
      cancelReason: null
    };
  }

  get signal() {
    return this.controller.signal;
  }

  on(name, handler) {
    const list = this.handlers.get(name) ?? [];
    list.push(handler);
    this.handlers.set(name, list);
  }

  emit(name, event) {
    for (const handler of this.handlers.get(name) ?? []) {
      handler(event);
    }
  }

  cancel(reason = 'requested') {
    if (this.control.canceledAt) {
      return false;
    }
    const canceledAt = now();
    this.control.stopStarting = true;
    this.control.canceledAt = canceledAt;
    this.control.cancelReason = reason;
    this.controller.abort({
      kind: 'canceled',
      message: reason,
      canceledAt
    });
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
      runtime: this
    });
  }
}

