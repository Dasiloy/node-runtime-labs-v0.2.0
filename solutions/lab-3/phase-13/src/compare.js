import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const scenarios = [
  {
    name: 'naive-default',
    mode: 'naive',
    command: ['src/naive.js', '--output', 'out/compare-naive.ndjson', '--report', 'reports/naive-default.json'],
    report: 'reports/naive-default.json',
    output: 'out/compare-naive.ndjson',
    equivalent: true,
  },
  {
    name: 'stream-default',
    mode: 'stream',
    command: ['src/stream.js', '--output', 'out/compare-stream.ndjson', '--report', 'reports/stream-default.json'],
    report: 'reports/stream-default.json',
    output: 'out/compare-stream.ndjson',
    equivalent: true,
  },
  {
    name: 'pressure-default',
    mode: 'pressure',
    command: ['src/pressure.js', '--report', 'reports/pressure-default.json'],
    report: 'reports/pressure-default.json',
    output: null,
    equivalent: false,
  },
  {
    name: 'pressure-slow-5ms',
    mode: 'pressure',
    command: ['src/pressure.js', '--slow-write-ms', '5', '--write-hwm', '1024', '--report', 'reports/pressure-slow-5ms.json'],
    report: 'reports/pressure-slow-5ms.json',
    output: null,
    equivalent: false,
  },
  {
    name: 'stream-gzip',
    mode: 'stream',
    command: ['src/stream.js', '--gzip', '--output', 'out/compare-stream.ndjson.gz', '--report', 'reports/stream-gzip.json'],
    report: 'reports/stream-gzip.json',
    output: 'out/compare-stream.ndjson.gz',
    gzip: true,
    equivalent: true,
  },
  {
    name: 'stream-low-read-hwm',
    mode: 'stream',
    command: ['src/stream.js', '--read-hwm', '7', '--output', 'out/compare-low-read-hwm.ndjson', '--report', 'reports/stream-low-read-hwm.json'],
    report: 'reports/stream-low-read-hwm.json',
    output: 'out/compare-low-read-hwm.ndjson',
    equivalent: true,
  },
  {
    name: 'pressure-large-write-hwm',
    mode: 'pressure',
    command: ['src/pressure.js', '--slow-write-ms', '5', '--write-hwm', '65536', '--report', 'reports/pressure-large-write-hwm.json'],
    report: 'reports/pressure-large-write-hwm.json',
    output: null,
    equivalent: false,
  },
];

function runNode(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    child.on('error', rejectRun);
    child.on('exit', (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(new Error(`${args[0]} exited with code ${code}`));
    });
  });
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Missing or invalid report ${path}: ${error.message}`);
  }
}

async function logicalOutput(path, gzip = false) {
  const bytes = await readFile(path);
  return gzip ? gunzipSync(bytes) : bytes;
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function countLines(bytes) {
  const text = bytes.toString('utf8');

  if (text.length === 0) {
    return 0;
  }

  return text.endsWith('\n') ? text.slice(0, -1).split('\n').length : text.split('\n').length;
}

function metric(report, path, fallback = 0) {
  let current = report;

  for (const part of path) {
    current = current?.[part];
    if (current === undefined || current === null) {
      return fallback;
    }
  }

  return current;
}

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toString() : '0';
}

function tableRow(values) {
  return `| ${values.join(' | ')} |`;
}

async function main() {
  await mkdir(resolve('reports'), { recursive: true });

  for (const scenario of scenarios) {
    await runNode(scenario.command);
  }

  const results = [];
  let baselineHash = null;
  let mismatch = null;

  for (const scenario of scenarios) {
    const report = await readJson(scenario.report);
    let outputStatus = 'n/a';
    let logicalHash = null;
    let logicalLines = null;

    if (scenario.output) {
      const bytes = await logicalOutput(scenario.output, scenario.gzip);
      logicalHash = hashBytes(bytes);
      logicalLines = countLines(bytes);

      if (scenario.equivalent) {
        if (baselineHash === null) {
          baselineHash = logicalHash;
          outputStatus = 'baseline';
        } else if (logicalHash === baselineHash) {
          outputStatus = 'match';
        } else {
          outputStatus = 'mismatch';
          mismatch ??= `${scenario.name} differs from naive-default`;
        }
      }
    }

    results.push({
      scenario,
      report,
      outputStatus,
      logicalHash,
      logicalLines,
    });
  }

  const headers = [
    'Scenario',
    'Mode',
    'Input bytes',
    'Output bytes',
    'Rows',
    'Matches',
    'Elapsed ms',
    'Peak RSS',
    'Peak heap',
    'Peak external',
    'Drains',
    'Output',
    'Report',
  ];
  const rows = [
    tableRow(headers),
    tableRow(headers.map(() => '---')),
  ];

  for (const result of results) {
    const report = result.report;
    rows.push(tableRow([
      result.scenario.name,
      report.mode,
      formatNumber(metric(report, ['input', 'bytes'])),
      formatNumber(metric(report, ['output', 'bytes'])),
      formatNumber(metric(report, ['counts', 'rows'])),
      formatNumber(metric(report, ['counts', 'matches'])),
      formatNumber(metric(report, ['timing', 'elapsedMs'])),
      formatNumber(metric(report, ['memory', 'peak', 'rss'])),
      formatNumber(metric(report, ['memory', 'peak', 'heapUsed'])),
      formatNumber(metric(report, ['memory', 'peak', 'external'])),
      formatNumber(metric(report, ['details', 'sink', 'drainCount'])),
      result.outputStatus,
      result.scenario.report,
    ]));
  }

  const productionRule = 'Production rule: use the streaming processor for unbounded or user-supplied input, keep filters before transforms, and enable gzip only when the measured byte reduction is worth the added transform stage for the current sink.';
  const markdown = [
    '# Stream Processing Workbench Comparison',
    '',
    ...rows,
    '',
    'Equivalent outputs use decompressed logical content for gzip scenarios.',
    '',
    productionRule,
    '',
  ].join('\n');

  await mkdir(dirname(resolve('reports/comparison.md')), { recursive: true });
  await writeFile('reports/comparison.md', markdown);

  if (mismatch) {
    console.error(mismatch);
    process.exitCode = 1;
    return;
  }

  console.log('comparison complete');
  console.log('reports/comparison.md');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
