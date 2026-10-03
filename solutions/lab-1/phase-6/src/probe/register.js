import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
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
const sampleTimer = setInterval(sendMemorySample, sampleMs);
sampleTimer.unref?.();
