import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseCacheArgs(args) {
  const options = {
    format: 'text',
    preserveSymlinks: false,
  };
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--format') {
      const value = args[++index];
      if (value !== 'text' && value !== 'json') {
        throw new Error('--format expects "text" or "json"');
      }
      options.format = value;
      continue;
    }
    if (arg === '--preserve-symlinks') {
      options.preserveSymlinks = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new Error('cache expects exactly: cache <entry>');
  }

  return {
    entry: positionals[0],
    options,
  };
}

function waitForChild(child) {
  return new Promise((resolve) => {
    child.on('close', (code, signal) => {
      resolve({ code, signal });
    });
  });
}

function buildTreeLines(report) {
  const probeNeedle = `${path.sep}src${path.sep}probes${path.sep}cache-probe.cjs`;
  const entries = new Map(
    report.cacheEntries
      .filter((entry) => !entry.filename.endsWith(probeNeedle))
      .map((entry) => [entry.filename, entry]),
  );
  const seen = new Set();
  const lines = [];

  function visit(filename, depth) {
    const entry = entries.get(filename);
    if (!entry) {
      return;
    }

    const marker = seen.has(filename) ? ' (shared)' : '';
    lines.push(`${'  '.repeat(depth)}- ${path.relative(process.cwd(), filename)}${marker}`);
    if (seen.has(filename)) {
      return;
    }
    seen.add(filename);

    for (const child of entry.children) {
      visit(child, depth + 1);
    }
  }

  visit(report.entry, 0);
  return lines;
}

function repeatedRequestRows(report) {
  const byResolved = new Map();
  for (const event of report.loadEvents) {
    if (!event.resolved || event.resolved.startsWith('node:')) {
      continue;
    }
    const events = byResolved.get(event.resolved) ?? [];
    events.push(event);
    byResolved.set(event.resolved, events);
  }

  return [...byResolved.entries()]
    .filter(([, events]) => events.length > 1)
    .map(([resolved, events]) => ({
      resolved,
      count: events.length,
      cacheHitsBefore: events.filter((event) => event.cacheHitBefore).length,
    }));
}

function renderCacheText(report, reportPath) {
  const lines = [
    `Cache report: ${path.relative(process.cwd(), reportPath)}`,
    `Entry: ${path.relative(process.cwd(), report.entry)}`,
    `Preserve symlinks: ${String(report.preserveSymlinks)}`,
    '',
    'Loaded module tree:',
    ...buildTreeLines(report),
  ];

  const repeated = repeatedRequestRows(report);
  if (repeated.length > 0) {
    lines.push('', 'Repeated requests:');
    for (const row of repeated) {
      lines.push(`  ${path.relative(process.cwd(), row.resolved)} requested ${row.count} times, cache hits before load: ${row.cacheHitsBefore}`);
    }
  }

  return lines.join('\n');
}

export async function runCacheCommand(args) {
  let parsed;
  try {
    parsed = parseCacheArgs(args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }

  const reportsRoot = path.resolve('reports');
  await fs.mkdir(reportsRoot, { recursive: true });
  const reportPath = path.join(reportsRoot, `cache-report-${Date.now()}.json`);
  const probePath = path.resolve('src/probes/cache-probe.cjs');
  const entry = path.resolve(parsed.entry);
  const execArgs = [];
  if (parsed.options.preserveSymlinks) {
    execArgs.push('--preserve-symlinks');
  }
  execArgs.push('--require', probePath, entry);

  const child = spawn(process.execPath, execArgs, {
    stdio: parsed.options.format === 'json' ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      MODULE_INSPECTOR_CACHE_REPORT: reportPath,
    },
  });

  if (child.stdout) {
    child.stdout.pipe(process.stderr);
  }

  const result = await waitForChild(child);
  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  report.reportPath = reportPath;

  if (parsed.options.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderCacheText(report, reportPath));
  }

  if (result.code !== 0) {
    process.exitCode = result.code ?? 1;
  }
}
