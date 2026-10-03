import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import { performance } from "node:perf_hooks";

export function createFileSink({
  filePath = "data/events.ndjson",
  slowSinkMs = 0,
  metrics,
  onDrain = () => {}
} = {}) {
  mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });

  const fileStream = createWriteStream(path.resolve(filePath), {
    flags: "a",
    highWaterMark: 1024
  });
  const stream =
    slowSinkMs > 0
      ? createSlowWritable(fileStream, slowSinkMs)
      : fileStream;

  stream.on("drain", () => {
    metrics.fileDrainCount += 1;
    metrics.fileBufferedBytes = stream.writableLength;
    onDrain();
  });

  stream.on("error", error => {
    metrics.sinkErrors += 1;
    throw error;
  });

  return {
    type: "file",
    writeEvent(event) {
      const line = `${JSON.stringify(event)}\n`;
      const startedAt = performance.now();
      let resolveDone;
      let rejectDone;
      const done = new Promise((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
      });

      const ok = stream.write(line, error => {
        const latency = performance.now() - startedAt;
        metrics.sinkWriteLatencyMs.push(latency);
        metrics.fileWrites += 1;
        metrics.fileBufferedBytes = stream.writableLength;
        if (error) {
          metrics.sinkErrors += 1;
          rejectDone(error);
          return;
        }
        resolveDone();
      });

      metrics.fileBufferedBytes = stream.writableLength;
      return { ok, done };
    },
    snapshot() {
      return {
        fileWrites: metrics.fileWrites,
        fileDrainCount: metrics.fileDrainCount,
        fileBufferedBytes: stream.writableLength
      };
    },
    async close() {
      await new Promise((resolve, reject) => {
        stream.end(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

    }
  };
}

function createSlowWritable(fileStream, delayMs) {
  return new Writable({
    highWaterMark: 1024,
    write(chunk, encoding, callback) {
      setTimeout(() => {
        fileStream.write(chunk, encoding, callback);
      }, delayMs);
    },
    final(callback) {
      fileStream.end(callback);
    }
  });
}
