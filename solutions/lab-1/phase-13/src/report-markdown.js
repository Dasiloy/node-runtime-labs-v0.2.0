import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeMarkdownReport(report, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, renderMarkdown(report));
}

function renderMarkdown(report) {
  const failures = [
    ...report.failures.warnings.map((event) => ["warning", event]),
    ...report.failures.unhandledRejections.map((event) => ["unhandled-rejection", event]),
    ...report.failures.uncaughtExceptions.map((event) => ["uncaught-exception", event]),
  ];

  return `# Flight Recorder Report

Target: \`${report.command.target.input}\`

| Metric | Value |
| --- | ---: |
| Exit | ${report.lifecycle.signal ?? report.lifecycle.exitCode ?? "unknown"} |
| Duration | ${formatNumber(report.durationMs)} ms |
| Peak RSS | ${formatBytes(report.memory.peaks.peakRss)} |
| Total CPU | ${formatNumber(report.cpu.totalCpuMicros / 1000)} ms |
| Max event loop delay | ${formatNumber(report.eventLoop.summary.maxDelayMs)} ms |
| Warnings | ${report.failures.warnings.length} |
| Fatal failures | ${report.failures.unhandledRejections.length + report.failures.uncaughtExceptions.length} |

## Observations

- Peak external memory: ${formatBytes(report.memory.peaks.peakExternal)}
- Hottest CPU sample: ${formatNumber(report.cpu.hottestSample?.cpuPercent ?? 0)}%
- Active handle categories: \`${JSON.stringify(report.handles.summary.categoryCounts)}\`

## Warnings And Failures

${failures.length ? failures.map(([type, event]) => `- ${type} at ${event.at} ms: ${event.message}`).join("\n") : "None recorded."}

## Timeline Excerpt

| At ms | Type | Source |
| ---: | --- | --- |
${report.timeline.slice(0, 25).map((event) => `| ${event.at} | ${event.type} | ${event.source} |`).join("\n")}
`;
}

function formatBytes(bytes) {
  return `${formatNumber(bytes / 1024 / 1024)} MiB`;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}
