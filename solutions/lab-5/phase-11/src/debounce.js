export class DebounceBatcher {
  #timer = null;
  #events = [];
  #startedAt = null;

  constructor({ debounceMs, onFlush }) {
    this.debounceMs = debounceMs;
    this.onFlush = onFlush;
  }

  push(event) {
    if (this.#events.length === 0) {
      this.#startedAt = new Date().toISOString();
    }

    this.#events.push(event);
    this.#reset();
  }

  get pendingCount() {
    return this.#events.length;
  }

  async flush(reason = 'manual') {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }

    if (this.#events.length === 0) {
      return null;
    }

    const events = this.#events;
    const startedAt = this.#startedAt;
    this.#events = [];
    this.#startedAt = null;

    return this.onFlush({
      reason,
      events,
      startedAt,
      settledAt: new Date().toISOString(),
      debounceMs: this.debounceMs
    });
  }

  clear() {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    const pending = this.#events.length;
    this.#events = [];
    this.#startedAt = null;
    return pending;
  }

  #reset() {
    if (this.#timer) {
      clearTimeout(this.#timer);
    }

    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.flush('debounce-settled').catch((error) => {
        this.onFlush({
          reason: 'flush-error',
          events: [],
          startedAt: new Date().toISOString(),
          settledAt: new Date().toISOString(),
          debounceMs: this.debounceMs,
          error
        });
      });
    }, this.debounceMs);
  }
}
