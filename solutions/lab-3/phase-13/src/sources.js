import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Transform, compose } from 'node:stream';
import { createGunzip } from 'node:zlib';

function createByteCounter(onBytes) {
  return new Transform({
    transform(chunk, encoding, callback) {
      onBytes(chunk.byteLength);
      callback(null, chunk);
    },
  });
}

function streamOptions(highWaterMark) {
  return highWaterMark === undefined ? undefined : { highWaterMark };
}

export async function createSource(options = {}) {
  const kind = options.source ?? 'file';
  const inputPath = options.input ? resolve(options.input) : resolve('data/access.ndjson');
  const highWaterMark = options.readHwm;
  const counters = {
    bytesRead: 0,
    compressedBytesRead: 0,
    uncompressedBytesRead: 0,
  };
  const meta = {
    kind,
    inputPath: kind === 'stdin' ? null : inputPath,
    compressed: kind === 'gzip',
    declaredBytes: null,
    readHwm: highWaterMark ?? null,
  };

  let stages;

  if (kind === 'file') {
    const fileStat = await stat(inputPath);
    meta.declaredBytes = fileStat.size;
    stages = [
      createReadStream(inputPath, streamOptions(highWaterMark)),
      createByteCounter((bytes) => {
        counters.bytesRead += bytes;
        counters.uncompressedBytesRead += bytes;
      }),
    ];
  } else if (kind === 'stdin') {
    stages = [
      process.stdin,
      createByteCounter((bytes) => {
        counters.bytesRead += bytes;
        counters.uncompressedBytesRead += bytes;
      }),
    ];
  } else if (kind === 'gzip') {
    const fileStat = await stat(inputPath);
    meta.declaredBytes = fileStat.size;
    stages = [
      createReadStream(inputPath, streamOptions(highWaterMark)),
      createByteCounter((bytes) => {
        counters.compressedBytesRead += bytes;
      }),
      createGunzip(),
      createByteCounter((bytes) => {
        counters.bytesRead += bytes;
        counters.uncompressedBytesRead += bytes;
      }),
    ];
  } else {
    throw new Error(`Unknown source: ${kind}`);
  }

  return {
    stream: compose(...stages),
    meta,
    counters,
    snapshot() {
      return { ...counters };
    },
  };
}
