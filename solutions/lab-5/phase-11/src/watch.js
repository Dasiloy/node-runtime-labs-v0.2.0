import { watch as fsWatch, watchFile, unwatchFile } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inventoryToCache, loadCache, saveCacheAtomic } from './cache.js';
import { diffInventories } from './diff.js';
import { DebounceBatcher } from './debounce.js';
import { createLogicalEvents } from './atomic.js';
import { TaskQueue } from './queue.js';
import { appendJsonLine, rebuildFromDiff, warmBuildCache } from './rebuild.js';
import { fromPosixRelative, scanTree, shouldIgnoreRelative, toPosixRelative } from './scan.js';

const DEFAULT_CACHE_PATH = '.cache/index.json';
const EVENT_BUFFER_LIMIT = 1000;
const SIGNAL_EXIT_CODES = new Map([
  ['SIGINT', 130],
  ['SIGTERM', 143]
]);

function compactStats(stats) {
  return {
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
    mode: stats.mode,
    ino: stats.ino,
    dev: stats.dev,
    nlink: stats.nlink
  };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

export async function startWatchSession(options) {
  const session = new WatchSession(options);
  await session.start();
  return session;
}

class WatchSession {
  constructor({
    root,
    flags = {},
    registerSignals = true
  }) {
    this.root = path.resolve(root);
    this.flags = {
      metadata: true,
      hash: true,
      followSymlinks: Boolean(flags.followSymlinks),
      poll: Boolean(flags.poll),
      pollInterval: flags.pollInterval ?? 1000,
      debounce: flags.debounce ?? 150,
      concurrency: flags.concurrency ?? 2,
      rebuildDelayMs: flags.rebuildDelayMs ?? 25,
      cache: flags.cache ?? DEFAULT_CACHE_PATH,
      noCache: Boolean(flags.noCache)
    };
    this.reportsDir = path.resolve(process.cwd(), 'reports');
    this.cachePath = path.resolve(process.cwd(), this.flags.cache);
    this.registerSignals = registerSignals;
    this.watchers = new Map();
    this.pollers = new Map();
    this.events = [];
    this.logicalEvents = [];
    this.eventId = 0;
    this.batchId = 0;
    this.jobId = 0;
    this.pollCallbacks = 0;
    this.discoveryScans = 0;
    this.pollingStartedAt = null;
    this.lastRegisteredFiles = 0;
    this.reportWriteChain = Promise.resolve();
    this.acceptingEvents = false;
    this.state = 'created';
    this.exitCode = 0;
    this.cacheData = null;
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
    this.queue = new TaskQueue({
      concurrency: this.flags.concurrency,
      onSample: (sample) => {
        this.reportWriteChain = this.reportWriteChain
          .then(() => appendJsonLine(path.join(this.reportsDir, 'queue.jsonl'), sample))
          .catch((error) => {
          console.error(`failed to write queue sample: ${error.message}`);
        });
      }
    });
    this.batcher = new DebounceBatcher({
      debounceMs: this.flags.debounce,
      onFlush: (batch) => this.handleBatch(batch)
    });
  }

  async start() {
    this.state = 'starting';
    await mkdir(this.reportsDir, { recursive: true });

    const previous = await this.loadPreviousCache();
    const baseline = await this.scanAndWriteReports(previous, 'watch-startup');
    const buildCache = previous?.buildCache ?? {
      version: 1,
      builderVersion: 'lab-5-builder-v1',
      entries: {}
    };
    const warmup = await warmBuildCache({
      currentInventory: baseline,
      buildCache,
      reportsDir: this.reportsDir
    });
    await appendJsonLine(path.join(this.reportsDir, 'rebuilds.jsonl'), warmup);

    this.cacheData = inventoryToCache(baseline, {
      ...this.flags,
      buildCache
    }, previous);
    await this.saveCache(baseline);

    if (this.flags.poll) {
      this.startPolling(baseline);
    } else {
      this.syncNativeWatchers(baseline);
    }

    this.acceptingEvents = true;
    this.state = 'running';
    this.registerSignalHandlers();
    await this.writeWatchState('started');

    console.log(`watching ${path.relative(process.cwd(), this.root) || '.'} (${this.flags.poll ? 'polling' : 'native'}, debounce ${this.flags.debounce}ms, concurrency ${this.flags.concurrency}, rebuild delay ${this.flags.rebuildDelayMs}ms)`);
  }

  async loadPreviousCache() {
    if (this.flags.noCache) {
      return null;
    }

    const loaded = await loadCache(this.cachePath);
    return loaded.data;
  }

  async scanAndWriteReports(previous, reason) {
    const inventory = await scanTree(this.root, {
      metadata: true,
      hash: true,
      followSymlinks: this.flags.followSymlinks
    });
    const diff = diffInventories(previous, inventory);

    inventory.watch = {
      reason,
      mode: this.flags.poll ? 'poll' : 'native'
    };
    await writeFile(path.join(this.reportsDir, 'scan.json'), `${JSON.stringify(inventory, null, 2)}\n`);
    await writeFile(path.join(this.reportsDir, 'diff.json'), `${JSON.stringify(diff, null, 2)}\n`);

    return inventory;
  }

  async saveCache(inventory) {
    if (this.flags.noCache) {
      return null;
    }

    this.cacheData = await saveCacheAtomic(this.cachePath, inventory, {
      ...this.flags,
      buildCache: this.cacheData?.buildCache
    }, this.cacheData);
    return this.cacheData;
  }

  registerSignalHandlers() {
    if (!this.registerSignals || this.signalsRegistered) {
      return;
    }

    this.onSignal = (signal) => {
      if (this.state === 'stopping') {
        this.state = 'forced';
        process.exit(SIGNAL_EXIT_CODES.get(signal) ?? 1);
      }

      this.stop({ reason: 'signal', signal }).catch((error) => {
        console.error(`shutdown failed: ${error.message}`);
        process.exitCode = 1;
        this.resolveDone();
      });
    };

    process.on('SIGINT', this.onSignal);
    process.on('SIGTERM', this.onSignal);
    this.signalsRegistered = true;
  }

  unregisterSignalHandlers() {
    if (!this.signalsRegistered) {
      return;
    }

    process.off('SIGINT', this.onSignal);
    process.off('SIGTERM', this.onSignal);
    this.signalsRegistered = false;
  }

  syncNativeWatchers(inventory) {
    const directories = inventory.directories.length > 0
      ? inventory.directories.map((record) => record.path)
      : ['.'];

    for (const relativePath of directories) {
      const absolutePath = fromPosixRelative(this.root, relativePath);
      if (this.watchers.has(absolutePath)) {
        continue;
      }

      try {
        const watcher = fsWatch(absolutePath, { persistent: true }, (eventType, filename) => {
          this.handleNativeEvent({ eventType, filename, watchRoot: absolutePath });
        });
        watcher.on('error', (error) => {
          this.recordErrorEvent({
            source: 'fs.watch',
            phase: 'watch',
            operation: 'event-delivery',
            path: toPosixRelative(this.root, absolutePath),
            error
          });
        });
        this.watchers.set(absolutePath, watcher);
      } catch (error) {
        this.recordErrorEvent({
          source: 'fs.watch',
          phase: 'watch',
          operation: 'registration',
          path: toPosixRelative(this.root, absolutePath),
          error
        });
      }
    }
  }

  startPolling(inventory) {
    this.pollingStartedAt = Date.now();
    this.syncPollers(inventory);
    const discoveryInterval = Math.max(this.flags.pollInterval * 2, 500);
    this.discoveryTimer = setInterval(() => {
      this.discoveryScans += 1;
      scanTree(this.root, {
        metadata: true,
        hash: true,
        followSymlinks: this.flags.followSymlinks
      }).then((latest) => {
        this.syncPollers(latest);
        const known = new Set(this.cacheData ? Object.keys(this.cacheData.filesByPath ?? {}) : []);
        for (const record of latest.files) {
          if (!known.has(record.path)) {
            this.recordRawEvent({
              eventType: 'rename',
              filename: record.path,
              watchRoot: '.',
              absolutePath: fromPosixRelative(this.root, record.path),
              relativePath: record.path,
              source: 'poll-discovery',
              raw: { discovered: true }
            });
          }
        }
      }).catch((error) => {
        this.recordErrorEvent({
          source: 'poll-discovery',
          phase: 'watch',
          operation: 'discovery-scan',
          path: '.',
          error
        });
      });
    }, discoveryInterval);
  }

  syncPollers(inventory) {
    const regularPaths = new Set(
      inventory.files
        .filter((record) => record.type === 'file')
        .map((record) => record.path)
    );

    for (const [absolutePath, listener] of this.pollers) {
      const relativePath = toPosixRelative(this.root, absolutePath);
      if (!regularPaths.has(relativePath)) {
        unwatchFile(absolutePath, listener);
        this.pollers.delete(absolutePath);
      }
    }

    for (const relativePath of regularPaths) {
      const absolutePath = fromPosixRelative(this.root, relativePath);
      if (this.pollers.has(absolutePath)) {
        continue;
      }

      const listener = (curr, prev) => {
        this.pollCallbacks += 1;
        if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size && curr.ino === prev.ino) {
          return;
        }

        this.recordRawEvent({
          eventType: curr.nlink === 0 ? 'rename' : 'change',
          filename: relativePath,
          watchRoot: '.',
          absolutePath,
          relativePath,
          source: 'fs.watchFile',
          raw: {
            prev: compactStats(prev),
            curr: compactStats(curr)
          }
        });

        if (curr.nlink === 0) {
          unwatchFile(absolutePath, listener);
          this.pollers.delete(absolutePath);
        }
      };

      watchFile(absolutePath, { interval: this.flags.pollInterval }, listener);
      this.pollers.set(absolutePath, listener);
    }

    this.lastRegisteredFiles = this.pollers.size;
  }

  handleNativeEvent({ eventType, filename, watchRoot }) {
    const filenameText = filename == null ? null : filename.toString();
    const absolutePath = filenameText ? path.resolve(watchRoot, filenameText) : watchRoot;
    const relativePath = filenameText ? toPosixRelative(this.root, absolutePath) : null;

    this.recordRawEvent({
      eventType,
      filename: filenameText,
      watchRoot: toPosixRelative(this.root, watchRoot),
      absolutePath,
      relativePath,
      source: 'fs.watch',
      raw: {
        eventType,
        filename: filenameText
      },
      notes: filenameText ? [] : ['filename-missing']
    });
  }

  async recordRawEvent(event) {
    const normalized = {
      id: `event-${++this.eventId}`,
      time: new Date().toISOString(),
      eventType: event.eventType,
      filename: event.filename ?? null,
      watchRoot: event.watchRoot,
      absolutePath: event.absolutePath,
      relativePath: event.relativePath ?? null,
      source: event.source,
      raw: event.raw ?? {},
      notes: event.notes ?? []
    };

    normalized.ignored = normalized.relativePath ? shouldIgnoreRelative(normalized.relativePath) : false;
    this.events.push(normalized);
    if (this.events.length > EVENT_BUFFER_LIMIT) {
      this.events.shift();
    }

    await appendJsonLine(path.join(this.reportsDir, 'events.jsonl'), normalized);
    if (this.acceptingEvents && !normalized.ignored) {
      this.batcher.push(normalized);
    }

    console.log(`${normalized.time} ${normalized.source} ${normalized.eventType} ${normalized.relativePath ?? '(unknown path)'}`);
    await this.writeWatchState('event');
  }

  recordErrorEvent({ source, phase, operation, path: eventPath, error }) {
    return this.recordRawEvent({
      eventType: 'error',
      filename: eventPath,
      watchRoot: '.',
      absolutePath: eventPath ? fromPosixRelative(this.root, eventPath) : this.root,
      relativePath: eventPath ?? null,
      source,
      raw: {
        phase,
        operation,
        code: error?.code ?? 'UNKNOWN',
        message: error?.message ?? String(error)
      },
      notes: ['watcher-error']
    });
  }

  async handleBatch(batch) {
    if (batch.error) {
      console.error(`batch flush failed: ${batch.error.message}`);
      return null;
    }

    if (batch.events.length === 0) {
      return null;
    }

    const batchId = `batch-${++this.batchId}`;
    const previous = this.cacheData;
    const current = await scanTree(this.root, {
      metadata: true,
      hash: true,
      followSymlinks: this.flags.followSymlinks
    });
    const diff = diffInventories(previous, current);
    const logicalEvents = createLogicalEvents({
      batchId,
      rawEvents: batch.events,
      diff
    });
    this.logicalEvents.push(...logicalEvents);

    await writeFile(path.join(this.reportsDir, 'scan.json'), `${JSON.stringify(current, null, 2)}\n`);
    await writeFile(path.join(this.reportsDir, 'diff.json'), `${JSON.stringify(diff, null, 2)}\n`);
    await writeFile(path.join(this.reportsDir, 'logical-events.json'), `${JSON.stringify(this.logicalEvents, null, 2)}\n`);

    const paths = uniqueSorted([
      ...batch.events.map((event) => event.relativePath),
      ...diff.added.map((entry) => entry.path),
      ...diff.changed.map((entry) => entry.path),
      ...diff.deleted.map((entry) => entry.path)
    ]);
    const batchRecord = {
      batchId,
      startedAt: batch.startedAt,
      settledAt: batch.settledAt,
      debounceMs: batch.debounceMs,
      rawEventCount: batch.events.length,
      logicalEventCount: logicalEvents.length,
      paths,
      diffCounts: diff.counts
    };
    await appendJsonLine(path.join(this.reportsDir, 'batches.jsonl'), batchRecord);

    this.cacheData = inventoryToCache(current, {
      ...this.flags,
      buildCache: this.cacheData?.buildCache
    }, this.cacheData);

    const jobPaths = uniqueSorted([
      ...diff.added.map((entry) => entry.path),
      ...diff.changed.map((entry) => entry.path),
      ...diff.deleted.map((entry) => entry.path)
    ]);
    const job = {
      id: `job-${++this.jobId}`,
      batchId,
      paths: jobPaths,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      status: 'pending'
    };

    this.queue.add(job, async (queuedJob) => {
      const summary = await rebuildFromDiff({
        job: queuedJob,
        diff,
        currentInventory: current,
        buildCache: this.cacheData.buildCache,
        reportsDir: this.reportsDir,
        reason: 'watch-batch',
        rebuildDelayMs: this.flags.rebuildDelayMs
      });
      await appendJsonLine(path.join(this.reportsDir, 'rebuilds.jsonl'), summary);
      await this.saveCache(current);
      await this.writeWatchState('rebuild-finished');
      return summary;
    });

    await this.saveCache(current);
    if (this.flags.poll) {
      this.syncPollers(current);
    } else {
      this.syncNativeWatchers(current);
    }
    await this.writeWatchState('batch');
    return batchRecord;
  }

  async writeWatchState(event) {
    const elapsedPollingIntervals = this.flags.poll && this.pollingStartedAt
      ? Math.floor((Date.now() - this.pollingStartedAt) / this.flags.pollInterval)
      : 0;
    const registeredFiles = this.flags.poll ? Math.max(this.pollers.size, this.lastRegisteredFiles) : 0;
    const state = {
      time: new Date().toISOString(),
      event,
      mode: this.flags.poll ? 'poll' : 'native',
      pollIntervalMs: this.flags.poll ? this.flags.pollInterval : null,
      debounceMs: this.flags.debounce,
      registeredFiles,
      elapsedPollingIntervals,
      estimatedStatChecks: registeredFiles * elapsedPollingIntervals,
      pollCallbacks: this.pollCallbacks,
      discoveryScans: this.discoveryScans,
      events: this.events.length,
      watchers: this.watchers.size,
      pollers: this.pollers.size,
      queue: this.queue.snapshot()
    };
    await writeFile(path.join(this.reportsDir, 'watch-state.json'), `${JSON.stringify(state, null, 2)}\n`);
  }

  async stop({ reason = 'manual', signal = null } = {}) {
    if (this.state === 'stopping') {
      this.state = 'forced';
      return;
    }

    const started = Date.now();
    this.state = 'stopping';
    this.acceptingEvents = false;
    this.unregisterSignalHandlers();

    const closed = {
      watchers: 0,
      pollers: 0,
      timers: 0
    };

    for (const watcher of this.watchers.values()) {
      watcher.close();
      closed.watchers += 1;
    }
    this.watchers.clear();

    for (const [absolutePath, listener] of this.pollers) {
      unwatchFile(absolutePath, listener);
      closed.pollers += 1;
    }
    this.pollers.clear();

    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      closed.timers += 1;
    }

    const pendingEvents = this.batcher.pendingCount;
    await this.batcher.flush('shutdown');
    const queueDrained = await this.queue.waitForIdle(5000);
    let cacheSaved = false;

    if (!this.flags.noCache && this.cacheData) {
      await saveCacheAtomic(this.cachePath, {
        root: this.root,
        files: Object.values(this.cacheData.filesByPath ?? [])
      }, {
        ...this.flags,
        buildCache: this.cacheData.buildCache
      }, this.cacheData);
      cacheSaved = true;
    }

    const shutdown = {
      reason,
      signal,
      closed,
      cacheSaved,
      queueDrained,
      pendingJobs: this.queue.snapshot().pendingJobs,
      activeJobs: this.queue.snapshot().activeJobs,
      pendingEvents,
      durationMs: Date.now() - started
    };
    await writeFile(path.join(this.reportsDir, 'shutdown.json'), `${JSON.stringify(shutdown, null, 2)}\n`);
    await this.writeWatchState('shutdown');

    this.exitCode = signal ? (SIGNAL_EXIT_CODES.get(signal) ?? 1) : 0;
    this.state = 'stopped';
    this.resolveDone(shutdown);
  }
}
