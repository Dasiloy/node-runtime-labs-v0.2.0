import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const metricDefinitions = [
  ["durationMs", "Duration (ms)", (report) => report.durationMs],
  ["peakRss", "Peak RSS (bytes)", (report) => report.memory.peaks.peakRss],
  ["peakHeapUsed", "Peak heap used (bytes)", (report) => report.memory.peaks.peakHeapUsed],
  ["peakExternal", "Peak external (bytes)", (report) => report.memory.peaks.peakExternal],
  ["peakArrayBuffers", "Peak array buffers (bytes)", (report) => report.memory.peaks.peakArrayBuffers],
  ["totalCpuMicros", "Total CPU (micros)", (report) => report.cpu.totalCpuMicros],
  ["maxEventLoopDelayMs", "Max event loop delay (ms)", (report) => report.eventLoop.summary.maxDelayMs],
  ["exitCode", "Exit code", (report) => report.lifecycle.exitCode ?? report.lifecycle.signal ?? "unknown"],
  ["warningCount", "Warnings", (report) => report.failures.warnings.length],
  ["failureCount", "Fatal failures", (report) => report.failures.unhandledRejections.length + report.failures.uncaughtExceptions.length],
];

export async function compareReports({ paths, baseline, markdown }) {
  if (paths.length < 2) {
    throw new Error("compare requires at least two report paths");
  }

  const inputPaths = baseline && !paths.includes(baseline) ? [baseline, ...paths] : paths;
  const reports = await Promise.all(inputPaths.map(readReport));
  const schemaVersion = reports[0].report.schemaVersion;

  for (const { path, report } of reports) {
    if (report.schemaVersion !== schemaVersion) {
      throw new Error(`Schema mismatch in ${path}: expected ${schemaVersion}, got ${report.schemaVersion}`);
    }
  }

  const baselineIndex = baseline ? reports.findIndex((entry) => entry.path === baseline) : 0;
  const baselineEntry = reports[baselineIndex === -1 ? 0 : baselineIndex];
  const markdownText = renderComparison(reports, baselineEntry);
  await mkdir(dirname(markdown), { recursive: true });
  await writeFile(markdown, markdownText);
  return { markdown, reportCount: reports.length };
}

async function readReport(path) {
  return {
    path,
    report: JSON.parse(await readFile(path, "utf8")),
  };
}

function renderComparison(reports, baselineEntry) {
  const comparisonEntries = reports.filter((entry) => entry !== baselineEntry);
  const rows = [];
  const differences = [];

  for (const [key, label, readMetric] of metricDefinitions) {
    const baselineValue = readMetric(baselineEntry.report);
    for (const entry of comparisonEntries) {
      const value = readMetric(entry.report);
      const delta = numericDelta(value, baselineValue);
      const percent = percentDelta(delta, baselineValue);
      rows.push({ label, path: entry.path, baselineValue, value, delta, percent });
      if (typeof delta === "number") {
        differences.push({ key, label, path: entry.path, delta, percent, abs: Math.abs(delta) });
      }
    }
  }

  differences.sort((left, right) => {
    const leftPercent = Number.isFinite(left.percent) ? Math.abs(left.percent) : -1;
    const rightPercent = Number.isFinite(right.percent) ? Math.abs(right.percent) : -1;
    return rightPercent - leftPercent || right.abs - left.abs;
  });

  return `# Flight Recorder Comparison

Inputs:
${reports.map((entry) => `- \`${entry.path}\``).join("\n")}

Baseline: \`${baselineEntry.path}\`

Baseline command: \`${baselineEntry.report.command.argv.join(" ")}\`

| Metric | Report | Baseline | Value | Delta | Delta % |
| --- | --- | ---: | ---: | ---: | ---: |
${rows.map((row) => `| ${row.label} | \`${row.path}\` | ${formatValue(row.baselineValue)} | ${formatValue(row.value)} | ${formatValue(row.delta)} | ${formatPercent(row.percent)} |`).join("\n")}

## Top Differences

${differences.slice(0, 8).map((item) => `- ${item.label} in \`${item.path}\`: ${formatValue(item.delta)} (${formatPercent(item.percent)})`).join("\n")}

## Run Notes

${reports.map(({ path, report }) => `- \`${path}\`: exit ${report.lifecycle.signal ?? report.lifecycle.exitCode ?? "unknown"}, timedOut ${Boolean(report.lifecycle.timedOut)}, warnings ${report.failures.warnings.length}, fatal failures ${report.failures.unhandledRejections.length + report.failures.uncaughtExceptions.length}`).join("\n")}
`;
}

function numericDelta(value, baseline) {
  return typeof value === "number" && typeof baseline === "number" ? value - baseline : "n/a";
}

function percentDelta(delta, baseline) {
  if (typeof delta !== "number" || typeof baseline !== "number" || baseline === 0) return undefined;
  return (delta / baseline) * 100;
}

function formatValue(value) {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "n/a";
}
