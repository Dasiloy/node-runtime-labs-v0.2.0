import { createWriteStream } from 'node:fs';
import { Writable } from 'node:stream';

export class SlowWritable extends Writable {
  #delayMs;
  #outputStream;
  #metrics;

  constructor(options = {}) {
    super({ highWaterMark: options.highWaterMark ?? 16 * 1024 });

    this.#delayMs = options.delayMs ?? 1;
    this.#outputStream = options.discard === false && options.writeOutputPath
      ? createWriteStream(options.writeOutputPath)
      : null;
    this.#metrics = {
      chunks: 0,
      bytes: 0,
      drainCount: 0,
      writableLength: 0,
      writableHighWaterMark: this.writableHighWaterMark,
      maxBufferedBytes: 0,
      writableLengthSamples: [],
    };

    this.on('drain', () => {
      this.#metrics.drainCount += 1;
    });
  }

  #record(chunk) {
    this.#metrics.chunks += 1;
    this.#metrics.bytes += chunk.byteLength;
    this.#metrics.writableLength = this.writableLength;
    this.#metrics.maxBufferedBytes = Math.max(this.#metrics.maxBufferedBytes, this.writableLength);

    if (this.#metrics.writableLengthSamples.length < 1024) {
      this.#metrics.writableLengthSamples.push(this.writableLength);
    }
  }

  #finishWrite(callback) {
    if (this.#delayMs > 0) {
      setTimeout(callback, this.#delayMs);
      return;
    }

    callback();
  }

  _write(chunk, encoding, callback) {
    this.#record(chunk);

    if (!this.#outputStream) {
      this.#finishWrite(callback);
      return;
    }

    if (!this.#outputStream.write(chunk)) {
      this.#outputStream.once('drain', () => this.#finishWrite(callback));
      return;
    }

    this.#finishWrite(callback);
  }

  _final(callback) {
    if (!this.#outputStream) {
      callback();
      return;
    }

    this.#outputStream.end(callback);
  }

  _destroy(error, callback) {
    this.#outputStream?.destroy();
    callback(error);
  }

  metrics() {
    return {
      ...this.#metrics,
      writableLength: this.writableLength,
      maxBufferedBytes: Math.max(this.#metrics.maxBufferedBytes, this.writableLength),
    };
  }
}
