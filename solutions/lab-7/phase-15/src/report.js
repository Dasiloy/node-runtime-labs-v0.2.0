import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const INPUTS = Object.freeze({
  protocol: "docs/protocol.md",
  load: "reports/load-latest.json",
  final: "reports/final-report.json",
  connections: "reports/connections.jsonl",
  protocolErrors: "reports/protocol-errors.jsonl",
  metrics: "reports/metrics.jsonl"
});

export async function runReportCommand() {
  const inputs = await readInputs();
  const markdown = renderMarkdown(inputs);
  const html = renderHtml(markdown);

  await mkdir("reports", { recursive: true });
  await writeFile("reports/protocol-gateway.md", markdown);
  await writeFile("reports/protocol-gateway.html", html);

  console.log(JSON.stringify({
    event: "report.generated",
    markdown: "reports/protocol-gateway.md",
    html: "reports/protocol-gateway.html",
    inputs: inputs.status
  }, null, 2));
}

async function readInputs() {
  const status = {};
  const protocol = await readText(INPUTS.protocol, status);
  const load = await readJson(INPUTS.load, status);
  const final = await readJson(INPUTS.final, status);
  const connections = await readJsonl(INPUTS.connections, status);
  const protocolErrors = await readJsonl(INPUTS.protocolErrors, status);
  const metrics = await readJsonl(INPUTS.metrics, status);

  return { status, protocol, load, final, connections, protocolErrors, metrics };
}

function renderMarkdown(inputs) {
  const maxMetrics = summarizeMetrics(inputs.metrics);
  const lastMetrics = inputs.metrics.at(-1) ?? {};
  const connectionTotals = summarizeConnections(inputs.connections);
  const load = inputs.load ?? {};
  const final = inputs.final ?? {};
  const totals = load.totals ?? {};
  const throughput = load.throughput ?? {};
  const latency = load.latency ?? {};

  return `# Custom Binary Protocol Gateway Report

Generated at ${new Date().toISOString()}.

## Input Files

${Object.entries(inputs.status)
  .map(([file, state]) => `- ${file}: ${state}`)
  .join("\n")}

## Protocol Design

${inputs.protocol ?? "_Protocol document was unavailable._"}

The parser keeps one carry buffer per TCP connection. It appends new bytes only when a previous chunk ended before a complete frame, reads the payload length after the fixed header is present, decodes every complete frame in the current receive buffer, and stores only the incomplete tail for the next read.

Malformed input policy is recorded by stable protocol error codes. The latest run observed ${inputs.protocolErrors.length} protocol error records.

## Runtime Behavior

- Connections closed: ${inputs.connections.length}
- Frames observed from connection reports: ${connectionTotals.framesRead}
- Bytes observed from connection reports: ${connectionTotals.bytesRead}
- Last gateway framesReceived metric: ${lastMetrics.framesReceived ?? 0}
- Last gateway eventsForwarded metric: ${lastMetrics.eventsForwarded ?? 0}
- Protocol errors by code: ${JSON.stringify(lastMetrics.protocolErrorsByCode ?? {})}

## Backpressure And HTTP

- Max active connections: ${maxMetrics.activeConnections}
- Max file buffered bytes: ${maxMetrics.fileBufferedBytes}
- Max HTTP queue depth: ${maxMetrics.httpQueued}
- Max RSS bytes: ${maxMetrics.rss}
- Socket pauses: ${lastMetrics.socketPauseCount ?? 0}
- Socket resumes: ${lastMetrics.socketResumeCount ?? 0}

## Shutdown Result

- Reason: ${final.reason ?? "unavailable"}
- Open connections at shutdown: ${final.openConnectionsAtShutdown ?? 0}
- Dropped frames: ${final.droppedFrames ?? 0}
- Drained events: ${final.drainedEvents ?? 0}
- Forced socket closes: ${final.forcedSocketCloses ?? 0}
- Sink close time ms: ${final.sinkCloseTimeMs ?? 0}

## Load Result

- Frames sent: ${totals.framesSent ?? 0}
- Frames accepted by gateway metrics: ${lastMetrics.framesReceived ?? 0}
- Malformed frames injected: ${totals.protocolErrorsInjected ?? 0}
- Protocol errors observed: ${lastMetrics.protocolErrors ?? inputs.protocolErrors.length}
- Bytes sent: ${totals.bytesSent ?? 0}
- Throughput frames/sec: ${formatNumber(throughput.framesPerSecond)}
- Throughput bytes/sec: ${formatNumber(throughput.bytesPerSecond)}
- ACK count: ${totals.acksReceived ?? 0}
- ACK timeouts: ${totals.ackTimeouts ?? 0}
- ACK latency p50 ms: ${formatNumber(latency.p50)}
- ACK latency p95 ms: ${formatNumber(latency.p95)}
- Dropped frames: ${final.droppedFrames ?? lastMetrics.droppedFrames ?? 0}

The systems rule from this lab: a protocol gateway owns every byte boundary, every queue boundary, and every shutdown boundary it creates.`;
}

function renderHtml(markdown) {
  const body = markdown
    .split("\n")
    .map(line => {
      if (line.startsWith("# ")) {
        return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      }
      if (line.startsWith("## ")) {
        return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      }
      if (line.startsWith("- ")) {
        return `<li>${escapeHtml(line.slice(2))}</li>`;
      }
      if (line.trim() === "") {
        return "";
      }
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n")
    .replace(/(<li>.*<\/li>\n?)+/g, match => `<ul>\n${match}</ul>\n`);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Custom Binary Protocol Gateway Report</title>
  <style>
    body { font: 16px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 920px; padding: 0 1rem; color: #111827; }
    h1, h2 { line-height: 1.2; }
    h2 { margin-top: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: .25rem; }
    ul { padding-left: 1.5rem; }
    p { margin: .75rem 0; }
  </style>
</head>
<body>
${body}
</body>
</html>
`;
}

async function readText(filePath, status) {
  try {
    const text = await readFile(filePath, "utf8");
    status[filePath] = "present";
    return text;
  } catch {
    status[filePath] = "missing";
    return null;
  }
}

async function readJson(filePath, status) {
  const text = await readText(filePath, status);
  if (!text) {
    return null;
  }
  return JSON.parse(text);
}

async function readJsonl(filePath, status) {
  const text = await readText(filePath, status);
  if (!text) {
    return [];
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function summarizeMetrics(metrics) {
  return metrics.reduce(
    (max, sample) => ({
      activeConnections: Math.max(max.activeConnections, sample.activeConnections ?? 0),
      fileBufferedBytes: Math.max(max.fileBufferedBytes, sample.fileBufferedBytes ?? 0),
      httpQueued: Math.max(max.httpQueued, sample.httpQueued ?? 0),
      rss: Math.max(max.rss, sample.memory?.rss ?? 0)
    }),
    { activeConnections: 0, fileBufferedBytes: 0, httpQueued: 0, rss: 0 }
  );
}

function summarizeConnections(connections) {
  return connections.reduce(
    (totals, connection) => {
      totals.framesRead += connection.framesRead ?? 0;
      totals.bytesRead += connection.bytesRead ?? 0;
      return totals;
    },
    { framesRead: 0, bytesRead: 0 }
  );
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
