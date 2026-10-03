import { performance } from "node:perf_hooks";

export function createHttpSink({
  target,
  concurrency,
  timeoutMs,
  retries,
  queueLimit,
  overflowPolicy,
  metrics,
  onDrain = () => {}
}) {
  const queue = [];
  let inflight = 0;
  let closed = false;
  let closeResolve;
  const closePromise = new Promise(resolve => {
    closeResolve = resolve;
  });

  function writeEvent(event) {
    if (closed) {
      metrics.httpDropped += 1;
      return { ok: true, accepted: false, done: Promise.resolve(false) };
    }

    if (queue.length >= queueLimit) {
      if (overflowPolicy === "drop") {
        metrics.httpDropped += 1;
        return { ok: true, accepted: false, done: Promise.resolve(false) };
      }
    }

    let resolveDone;
    let rejectDone;
    const done = new Promise((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    queue.push({ event, attempts: 0, resolveDone, rejectDone });
    metrics.httpQueued = queue.length;
    pump();

    return {
      ok: queue.length < queueLimit,
      accepted: true,
      done
    };
  }

  function pump() {
    while (!closed && inflight < concurrency && queue.length > 0) {
      const item = queue.shift();
      metrics.httpQueued = queue.length;
      inflight += 1;
      metrics.httpInflight = inflight;
      void deliver(item)
        .then(() => item.resolveDone(true), item.rejectDone)
        .finally(() => {
          inflight -= 1;
          metrics.httpInflight = inflight;
          metrics.httpQueued = queue.length;
          if (queue.length < queueLimit) {
            onDrain();
          }
          pump();
          maybeClose();
        });
    }
  }

  async function deliver(item) {
    while (item.attempts <= retries) {
      item.attempts += 1;
      const startedAt = performance.now();
      try {
        const response = await fetch(target, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(item.event),
          signal: AbortSignal.timeout(timeoutMs)
        });
        metrics.httpLatencyMs.push(performance.now() - startedAt);

        if (response.status >= 200 && response.status < 300) {
          metrics.httpSent += 1;
          return;
        }

        if (response.status >= 400 && response.status < 500) {
          metrics.httpFailed += 1;
          return;
        }

        if (item.attempts <= retries) {
          metrics.httpRetried += 1;
          continue;
        }

        metrics.httpFailed += 1;
        return;
      } catch (error) {
        metrics.httpLatencyMs.push(performance.now() - startedAt);
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          metrics.httpTimedOut += 1;
        }

        if (item.attempts <= retries) {
          metrics.httpRetried += 1;
          continue;
        }

        metrics.httpFailed += 1;
        return;
      }
    }
  }

  function maybeClose() {
    if (closed && inflight === 0 && queue.length === 0) {
      closeResolve();
    }
  }

  return {
    type: "http",
    writeEvent,
    snapshot() {
      return {
        sent: metrics.httpSent,
        retried: metrics.httpRetried,
        timedOut: metrics.httpTimedOut,
        failed: metrics.httpFailed,
        inflight,
        queued: queue.length,
        dropped: metrics.httpDropped
      };
    },
    async close() {
      closed = true;
      maybeClose();
      await closePromise;
    }
  };
}
