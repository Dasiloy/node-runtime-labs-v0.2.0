import { Transform } from 'node:stream';
import { applyPlugins } from './plugins.js';

export function createJsonParser(counters) {
  let lineNumber = 0;

  return new Transform({
    readableObjectMode: true,
    writableObjectMode: true,
    transform(line, encoding, callback) {
      if (line.length === 0) {
        callback();
        return;
      }

      lineNumber += 1;

      try {
        const row = JSON.parse(line);
        counters.rows += 1;
        callback(null, row);
      } catch (error) {
        callback(new Error(`Invalid JSON on line ${lineNumber}: ${error.message}`));
      }
    },
  });
}

export function createFilterStage(predicate, counters) {
  return new Transform({
    readableObjectMode: true,
    writableObjectMode: true,
    transform(row, encoding, callback) {
      if (predicate(row)) {
        counters.matches += 1;
        callback(null, row);
        return;
      }

      callback();
    },
  });
}

export function createAbortAfterRowsStage(options) {
  const threshold = options.abortAfterRows;

  return new Transform({
    readableObjectMode: true,
    writableObjectMode: true,
    transform(row, encoding, callback) {
      if (threshold !== undefined && options.getRows() >= threshold && !options.signal.aborted) {
        options.controller.abort(new Error(`aborted after ${threshold} parsed rows`));
      }

      callback(null, row);
    },
  });
}

export function createPluginStage(plugins) {
  return new Transform({
    readableObjectMode: true,
    writableObjectMode: true,
    transform(row, encoding, callback) {
      try {
        callback(null, applyPlugins(row, plugins));
      } catch (error) {
        callback(error);
      }
    },
  });
}

export function createNdjsonStringifier(byteCounters, options = {}) {
  let pending = '';
  const flushAtBytes = options.flushAtBytes ?? 64 * 1024;

  return new Transform({
    writableObjectMode: true,
    transform(row, encoding, callback) {
      pending += `${JSON.stringify(row)}\n`;

      if (Buffer.byteLength(pending) >= flushAtBytes) {
        byteCounters.outputUncompressed += Buffer.byteLength(pending);
        callback(null, pending);
        pending = '';
        return;
      }

      callback();
    },
    flush(callback) {
      if (pending.length > 0) {
        byteCounters.outputUncompressed += Buffer.byteLength(pending);
        callback(null, pending);
        pending = '';
        return;
      }

      callback();
    },
  });
}
