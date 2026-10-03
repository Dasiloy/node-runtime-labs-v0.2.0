import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeHtmlReport(report, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, renderHtml(report));
}

function renderHtml(report) {
  const summary = [
    ["Exit", report.lifecycle.signal ?? report.lifecycle.exitCode ?? "unknown"],
    ["Duration", `${formatNumber(report.durationMs)} ms`],
    ["Peak RSS", formatBytes(report.memory.peaks.peakRss)],
    ["CPU", `${formatNumber(report.cpu.totalCpuMicros / 1000)} ms`],
    ["Max Loop Delay", `${formatNumber(report.eventLoop.summary.maxDelayMs)} ms`],
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Flight Recorder Report</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 32px; color: #17202a; background: #f7f8fa; }
    h1, h2 { margin: 0 0 12px; }
    section { margin: 28px 0; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    .card { background: white; border: 1px solid #d9dee5; border-radius: 0; padding: 14px; }
    .label { color: #5f6b7a; font-size: 12px; text-transform: uppercase; }
    .value { font-size: 22px; font-weight: 700; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9dee5; }
    th, td { text-align: left; border-bottom: 1px solid #e7ebf0; padding: 8px 10px; vertical-align: top; }
    th { background: #eef1f5; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { white-space: pre-wrap; margin: 0; max-height: 180px; overflow: auto; }
  </style>
</head>
<body>
  <h1>Flight Recorder Report</h1>
  <p><code>${escapeHtml(report.command.target.input)}</code></p>
  <section class="summary">
    ${summary.map(([label, value]) => `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(String(value))}</div></div>`).join("\n")}
  </section>
  ${renderMetricSection(report)}
  ${renderFailures(report)}
  ${renderTimeline(report.timeline)}
</body>
</html>
`;
}

function renderMetricSection(report) {
  return `<section>
    <h2>Metrics</h2>
    <table>
      <tbody>
        <tr><th>Stdout</th><td>${report.stdio.stdout.bytes} bytes</td></tr>
        <tr><th>Stderr</th><td>${report.stdio.stderr.bytes} bytes</td></tr>
        <tr><th>Memory Samples</th><td>${report.memory.samples.length}</td></tr>
        <tr><th>CPU Samples</th><td>${report.cpu.samples.length}</td></tr>
        <tr><th>Event Loop Samples</th><td>${report.eventLoop.samples.length}</td></tr>
        <tr><th>Active Handles</th><td><pre>${escapeHtml(JSON.stringify(report.handles.summary.categoryCounts, null, 2))}</pre></td></tr>
      </tbody>
    </table>
  </section>`;
}

function renderFailures(report) {
  const rows = [
    ...report.failures.warnings.map((event) => ["warning", event]),
    ...report.failures.unhandledRejections.map((event) => ["unhandled-rejection", event]),
    ...report.failures.uncaughtExceptions.map((event) => ["uncaught-exception", event]),
  ];
  return `<section>
    <h2>Warnings And Failures</h2>
    <table>
      <thead><tr><th>Type</th><th>At</th><th>Message</th><th>Stack</th></tr></thead>
      <tbody>
        ${rows.map(([type, event]) => `<tr><td>${escapeHtml(type)}</td><td>${event.at}</td><td>${escapeHtml(event.message ?? "")}</td><td><pre>${escapeHtml(event.stack ?? "")}</pre></td></tr>`).join("\n")}
      </tbody>
    </table>
  </section>`;
}

function renderTimeline(timeline) {
  return `<section>
    <h2>Timeline</h2>
    <table>
      <thead><tr><th>At ms</th><th>Type</th><th>Source</th><th>Data</th></tr></thead>
      <tbody>
        ${timeline.slice(0, 200).map((event) => `<tr><td>${event.at}</td><td>${escapeHtml(event.type)}</td><td>${escapeHtml(event.source)}</td><td><pre>${escapeHtml(JSON.stringify(event.data))}</pre></td></tr>`).join("\n")}
      </tbody>
    </table>
  </section>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(bytes) {
  return `${formatNumber(bytes / 1024 / 1024)} MiB`;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}
