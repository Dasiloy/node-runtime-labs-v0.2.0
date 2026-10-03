import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import process from "node:process";

const probeFile = process.env.FLIGHT_RECORDER_PROBE_FILE;
const parentStartedAt = Number(process.env.FLIGHT_RECORDER_STARTED_AT_EPOCH_MS);
const runId = process.env.FLIGHT_RECORDER_RUN_ID;
const sampleMs = Math.max(10, Number(process.env.FLIGHT_RECORDER_SAMPLE_MS) || 250);

if (probeFile) {
  mkdirSync(dirname(probeFile), { recursive: true });
}

function nowOffset() {
  const base = Number.isFinite(parentStartedAt) ? parentStartedAt : Date.now();
  return Number((Date.now() - base).toFixed(3));
}

function sendProbeEvent(event) {
  if (!probeFile) return;
  appendFileSync(probeFile, `${JSON.stringify({ at: nowOffset(), ...event })}\n`);
}

sendProbeEvent({
  type: "probe-ready",
  pid: process.pid,
  nodeVersion: process.version,
  execArgv: process.execArgv,
  runId,
});

function sendMemorySample() {
  const usage = process.memoryUsage();
  sendProbeEvent({
    type: "memory-sample",
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  });
}

sendMemorySample();
let previousCpu = process.cpuUsage();
let previousCpuAt = performance.now();
const eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });
eventLoopDelay.enable();

function sendCpuSample() {
  const cpu = process.cpuUsage(previousCpu);
  const now = performance.now();
  const wallMs = now - previousCpuAt;
  const totalMicros = cpu.user + cpu.system;
  previousCpu = process.cpuUsage();
  previousCpuAt = now;

  sendProbeEvent({
    type: "cpu-sample",
    userMicros: cpu.user,
    systemMicros: cpu.system,
    totalMicros,
    wallMs: Number(wallMs.toFixed(3)),
    cpuPercent: wallMs > 0 ? Number(((totalMicros / (wallMs * 1000)) * 100).toFixed(3)) : 0,
  });
}

function cleanHistogramValue(value) {
  return Number.isFinite(value) ? value : 0;
}

let nextSampleDue = performance.now() + sampleMs;

function sendEventLoopSample(manualDelayNs) {
  const max = Math.max(cleanHistogramValue(eventLoopDelay.max), manualDelayNs);
  sendProbeEvent({
    type: "event-loop-sample",
    unit: "nanoseconds",
    min: cleanHistogramValue(eventLoopDelay.min),
    max,
    mean: cleanHistogramValue(eventLoopDelay.mean),
    stddev: cleanHistogramValue(eventLoopDelay.stddev),
    p50: cleanHistogramValue(eventLoopDelay.percentile(50)),
    p95: Math.max(cleanHistogramValue(eventLoopDelay.percentile(95)), manualDelayNs),
    p99: Math.max(cleanHistogramValue(eventLoopDelay.percentile(99)), manualDelayNs),
    exceeds: eventLoopDelay.exceeds,
    intervalDriftNs: manualDelayNs,
  });
  eventLoopDelay.reset();
}

function countByName(names) {
  const counts = {};
  for (const name of names) {
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

function readPrivateHandles() {
  if (typeof process._getActiveHandles !== "function") return [];
  return process._getActiveHandles().map((handle) => ({
    className: handle?.constructor?.name ?? "Unknown",
  }));
}

function sendActiveHandles() {
  const resources = typeof process.getActiveResourcesInfo === "function"
    ? process.getActiveResourcesInfo()
    : [];

  sendProbeEvent({
    type: "active-handles",
    resources,
    resourceCounts: countByName(resources),
    privateHandles: readPrivateHandles(),
  });
}

const sampleTimer = setInterval(() => {
  const sampleStartedAt = performance.now();
  const manualDelayNs = Math.max(0, sampleStartedAt - nextSampleDue) * 1_000_000;
  nextSampleDue = sampleStartedAt + sampleMs;
  sendMemorySample();
  sendCpuSample();
  sendEventLoopSample(manualDelayNs);
  sendActiveHandles();
}, sampleMs);
sampleTimer.unref?.();
