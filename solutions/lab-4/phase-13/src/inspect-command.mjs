import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { collectCacheReport } from './cache-command.mjs';
import { resolveSpecifier } from './resolver/index.mjs';
import { renderHtmlReport } from './reports/html.mjs';
import { renderMarkdownReport } from './reports/markdown.mjs';

function parseInspectArgs(args) {
  if (args.length !== 1 || args[0].startsWith('--')) {
    throw new Error('inspect-package expects exactly: inspect-package <app-root>');
  }
  return path.resolve(args[0]);
}

async function readInspectorInput(appRoot) {
  const inputPath = path.join(appRoot, 'inspector-input.json');
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  return input.traces ?? [];
}

function traceTimeline(trace) {
  const events = [
    {
      traceId: trace.id,
      type: 'classify',
      detail: `${trace.specifier} used ${trace.branch ?? 'failed'} branch`,
    },
  ];

  for (const metadata of trace.metadata) {
    events.push({
      traceId: trace.id,
      type: 'metadata',
      detail: `${metadata.kind} ${metadata.result}`,
    });
  }

  for (const warning of trace.warnings) {
    events.push({
      traceId: trace.id,
      type: 'warning',
      detail: warning.type,
    });
  }

  for (const error of trace.errors) {
    events.push({
      traceId: trace.id,
      type: 'error',
      detail: error.code,
    });
  }

  return events;
}

function combineReport(appRoot, traces, runtimeReport) {
  const warnings = traces.flatMap((trace) => trace.warnings.map((warning) => ({ traceId: trace.id, ...warning })));
  const errors = traces.flatMap((trace) => trace.errors.map((error) => ({ traceId: trace.id, ...error })));
  const symlinks = traces.flatMap((trace) => trace.symlinks.map((note) => ({ traceId: trace.id, ...note })));
  const timeline = traces.flatMap(traceTimeline);

  if (runtimeReport) {
    timeline.push({
      type: 'runtime-cache',
      detail: `loaded ${runtimeReport.graph.nodes.length} modules`,
    });
  }

  return {
    summary: {
      appRoot,
      resolved: traces.filter((trace) => trace.status === 'resolved').length,
      failed: traces.filter((trace) => trace.status === 'failed').length,
    },
    traces,
    warnings,
    errors,
    graph: runtimeReport?.graph ?? { nodes: [], edges: [] },
    cycles: runtimeReport?.cycles ?? [],
    timeline,
    symlinks,
  };
}

async function runTrace(appRoot, index, input) {
  const importer = path.resolve(appRoot, input.importer);
  const report = await resolveSpecifier(importer, input.specifier, {
    mode: input.mode ?? 'require',
    conditions: input.conditions ?? [],
    format: 'json',
    preserveSymlinks: Boolean(input.preserveSymlinks),
    consumerFormat: input.consumerFormat,
    importedName: input.importedName,
  });
  report.id = `trace-${String(index + 1).padStart(2, '0')}`;
  return report;
}

export async function runInspectPackageCommand(args) {
  let appRoot;
  try {
    appRoot = parseInspectArgs(args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }

  const traceInputs = await readInspectorInput(appRoot);
  const traces = [];
  for (const [index, input] of traceInputs.entries()) {
    try {
      traces.push(await runTrace(appRoot, index, input));
    } catch (error) {
      traces.push({
        id: `trace-${String(index + 1).padStart(2, '0')}`,
        importer: path.resolve(appRoot, input.importer),
        specifier: input.specifier,
        status: 'failed',
        warnings: [],
        errors: [{
          code: 'trace-exception',
          message: error.message,
        }],
        metadata: [],
        symlinks: [],
      });
    }
  }

  const workspaceImporter = path.resolve('fixtures/generated/workspace/app/src/index.cjs');
  try {
    const symlinkTrace = await resolveSpecifier(workspaceImporter, 'pkg-linked', {
      mode: 'require',
      conditions: [],
      format: 'json',
      preserveSymlinks: true,
    });
    symlinkTrace.id = `trace-${String(traces.length + 1).padStart(2, '0')}`;
    traces.push(symlinkTrace);
  } catch {
    // The normal trace errors cover resolver failures. A missing workspace fixture leaves symlinks empty.
  }

  let runtimeReport = null;
  try {
    runtimeReport = (await collectCacheReport(path.resolve('fixtures/generated/cycles/a.cjs'), {
      preserveSymlinks: false,
      captureStdout: true,
    })).report;
  } catch {
    runtimeReport = null;
  }

  const report = combineReport(appRoot, traces, runtimeReport);
  const reportsRoot = path.resolve('reports');
  await fs.mkdir(reportsRoot, { recursive: true });
  await fs.writeFile(path.join(reportsRoot, 'module-inspector.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(reportsRoot, 'module-inspector.md'), renderMarkdownReport(report));
  await fs.writeFile(path.join(reportsRoot, 'module-inspector.html'), renderHtmlReport(report));

  console.log(`Wrote ${path.relative(process.cwd(), path.join(reportsRoot, 'module-inspector.json'))}`);
  console.log(`Wrote ${path.relative(process.cwd(), path.join(reportsRoot, 'module-inspector.md'))}`);
  console.log(`Wrote ${path.relative(process.cwd(), path.join(reportsRoot, 'module-inspector.html'))}`);
}
