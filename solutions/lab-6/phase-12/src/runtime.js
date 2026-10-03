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
      cancelReason: null,
      shutdownStartedAt: null,
      shutdownSignal: null,
      shutdownMode: options.shutdownMode ?? 'cancel',
      secondSignalAt: null
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

  requestShutdown(signalName, mode = this.control.shutdownMode) {
    const timestamp = now();
    if (this.control.shutdownStartedAt) {
      this.control.secondSignalAt = timestamp;
      this.emit('run:force-stop', { signalName, timestamp });
      return { forced: true };
    }
    this.control.stopStarting = true;
    this.control.shutdownStartedAt = timestamp;
    this.control.shutdownSignal = signalName;
    this.control.shutdownMode = mode;
    this.emit('run:shutdown', { signalName, timestamp, mode });
    if (mode === 'cancel') {
      this.cancel('shutdown:' + signalName);
    }
    return { forced: false };
  }

  async start() {
    return await runScheduledTasks(this.taskFile, {
      ...this.options,
      runtime: this,
      signal: this.signal
    });
  }
}

