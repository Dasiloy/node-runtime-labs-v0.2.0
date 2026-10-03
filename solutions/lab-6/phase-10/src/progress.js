const TASK_EVENTS = [
  'task:start',
  'task:success',
  'task:failure',
  'task:retry',
  'task:finish'
];

export function progressEvents(runtime) {
  const queue = [];
  const pulls = [];
  let closed = false;

  function toRecord(event) {
    return {
      type: event.type,
      taskId: event.taskId,
      status: event.status,
      attempt: event.attempt,
      timestamp: event.timestamp,
      message: event.error?.message ?? null
    };
  }

  function cleanup() {
    for (const eventName of TASK_EVENTS) {
      runtime.off(eventName, onEvent);
    }
    runtime.off('run:finish', onClose);
    runtime.off('run:error', onClose);
  }

  function flush() {
    while (pulls.length > 0 && queue.length > 0) {
      const resolve = pulls.shift();
      resolve({ value: queue.shift(), done: false });
    }

    if (closed) {
      while (pulls.length > 0) {
        const resolve = pulls.shift();
        resolve({ value: undefined, done: true });
      }
    }
  }

  function onEvent(event) {
    queue.push(toRecord(event));
    flush();
  }

  function onClose() {
    closed = true;
    cleanup();
    flush();
  }

  for (const eventName of TASK_EVENTS) {
    runtime.on(eventName, onEvent);
  }
  runtime.once('run:finish', onClose);
  runtime.once('run:error', onClose);

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift(), done: false });
      }

      if (closed) {
        return Promise.resolve({ value: undefined, done: true });
      }

      return new Promise((resolve) => {
        pulls.push(resolve);
      });
    },
    return() {
      closed = true;
      cleanup();
      flush();
      return Promise.resolve({ value: undefined, done: true });
    }
  };
}
