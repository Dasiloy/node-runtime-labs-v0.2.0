export class TaskQueue {
  constructor({ concurrency, onSample }) {
    this.concurrency = concurrency;
    this.onSample = onSample;
    this.active = new Map();
    this.pending = [];
    this.idleResolvers = [];
  }

  add(job, worker) {
    const pendingMatch = this.pending.find((entry) => intersects(entry.job.paths, job.paths));

    if (pendingMatch) {
      pendingMatch.job.paths = [...new Set([...pendingMatch.job.paths, ...job.paths])].sort();
      pendingMatch.job.coalescedAt = new Date().toISOString();
      this.#sample('job-coalesced', pendingMatch.job.id);
      return pendingMatch.job;
    }

    this.pending.push({ job, worker });
    this.#sample('job-enqueued', job.id);
    this.#drain();
    return job;
  }

  snapshot() {
    return {
      active: this.active.size,
      pending: this.pending.length,
      concurrency: this.concurrency,
      activeJobs: [...this.active.keys()],
      pendingJobs: this.pending.map((entry) => entry.job.id)
    };
  }

  async waitForIdle(timeoutMs = 5000) {
    if (this.active.size === 0 && this.pending.length === 0) {
      return true;
    }

    return Promise.race([
      new Promise((resolve) => this.idleResolvers.push(resolve)),
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs))
    ]);
  }

  #drain() {
    while (this.active.size < this.concurrency && this.pending.length > 0) {
      const { job, worker } = this.pending.shift();
      job.startedAt = new Date().toISOString();
      job.status = 'running';
      this.active.set(job.id, job);
      this.#sample('job-started', job.id);

      Promise.resolve()
        .then(() => worker(job))
        .then((result) => {
          job.result = result;
          job.status = 'succeeded';
        })
        .catch((error) => {
          job.status = 'failed';
          job.error = {
            code: error?.code ?? 'UNKNOWN',
            message: error?.message ?? String(error)
          };
        })
        .finally(() => {
          job.finishedAt = new Date().toISOString();
          this.active.delete(job.id);
          this.#sample('job-finished', job.id);
          this.#drain();
          this.#resolveIdleIfNeeded();
        });
    }
  }

  #resolveIdleIfNeeded() {
    if (this.active.size > 0 || this.pending.length > 0) {
      return;
    }

    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    for (const resolve of resolvers) {
      resolve(true);
    }
  }

  #sample(event, jobId) {
    this.onSample?.({
      time: new Date().toISOString(),
      active: this.active.size,
      pending: this.pending.length,
      concurrency: this.concurrency,
      event,
      jobId
    });
  }
}

function intersects(left, right) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}
