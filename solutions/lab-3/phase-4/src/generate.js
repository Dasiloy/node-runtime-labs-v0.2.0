import { createWriteStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';

const defaults = {
  rows: 250_000,
  payloadBytes: 128,
  errorRatio: 0.08,
  seed: 42,
  output: 'data/access.ndjson',
};

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const paths = [
  '/api/accounts',
  '/api/orders',
  '/api/search',
  '/health',
  '/login',
  '/static/app.js',
  '/checkout',
];
const okStatuses = [200, 200, 200, 201, 204, 301, 304, 400, 401, 403, 404, 429];
const errorStatuses = [500, 502, 503, 504];
const userAgents = [
  'node-fetch/3',
  'undici/7',
  'Chrome/125',
  'Firefox/126',
  'Safari/17',
  'curl/8',
];
const payloadAlphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function parseArgs(args) {
  const options = { ...defaults };
  const specs = new Map([
    ['--rows', ['rows', Number.parseInt]],
    ['--payload-bytes', ['payloadBytes', Number.parseInt]],
    ['--error-ratio', ['errorRatio', Number.parseFloat]],
    ['--seed', ['seed', Number.parseInt]],
    ['--output', ['output', String]],
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const spec = specs.get(flag);

    if (!spec) {
      throw new Error(`Unknown flag: ${flag}`);
    }

    const rawValue = args[index + 1];
    if (rawValue === undefined || rawValue.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }

    const [name, parse] = spec;
    options[name] = parse(rawValue);
    index += 1;
  }

  if (!Number.isInteger(options.rows) || options.rows < 0) {
    throw new Error('--rows must be a non-negative integer');
  }
  if (!Number.isInteger(options.payloadBytes) || options.payloadBytes < 0) {
    throw new Error('--payload-bytes must be a non-negative integer');
  }
  if (!Number.isFinite(options.errorRatio) || options.errorRatio < 0 || options.errorRatio > 1) {
    throw new Error('--error-ratio must be between 0 and 1');
  }
  if (!Number.isInteger(options.seed)) {
    throw new Error('--seed must be an integer');
  }

  return options;
}

function createPrng(seed) {
  let state = seed >>> 0;

  return function next() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

function createPayload(id, payloadBytes, random) {
  let payload = '';

  for (let index = 0; index < payloadBytes; index += 1) {
    const offset = (id + index + Math.floor(random() * payloadAlphabet.length)) % payloadAlphabet.length;
    payload += payloadAlphabet[offset];
  }

  return payload;
}

function createRow(id, options, random) {
  const statusPool = random() < options.errorRatio ? errorStatuses : okStatuses;
  const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, id % 60, Math.floor(id / 60) % 1000));

  return {
    id,
    ts: ts.toISOString(),
    method: pick(methods, random),
    path: pick(paths, random),
    status: pick(statusPool, random),
    ip: `10.${Math.floor(random() * 256)}.${Math.floor(random() * 256)}.${Math.floor(random() * 256)}`,
    userAgent: pick(userAgents, random),
    payload: createPayload(id, options.payloadBytes, random),
  };
}

async function writeRows(options) {
  const outputPath = resolve(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(resolve('reports'), { recursive: true });

  const writer = createWriteStream(outputPath, { encoding: 'utf8' });
  const random = createPrng(options.seed);

  for (let id = 1; id <= options.rows; id += 1) {
    const line = `${JSON.stringify(createRow(id, options, random))}\n`;

    if (!writer.write(line)) {
      await once(writer, 'drain');
    }
  }

  writer.end();
  await finished(writer);

  const fileStat = await stat(outputPath);
  const report = {
    rows: options.rows,
    payloadBytes: options.payloadBytes,
    errorRatio: options.errorRatio,
    seed: options.seed,
    outputFile: options.output,
    bytesWritten: fileStat.size,
  };

  await writeFile(resolve('reports/generator.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`generated rows: ${options.rows}`);
  console.log(`bytes written: ${fileStat.size}`);
  console.log(`output: ${options.output}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await writeRows(options);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
