import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { finishLifecycle, startLifecycle } from "./lifecycle.js";

export function isChildRunning(child) {
  return child.exitCode === null && child.signalCode === null;
}

export async function run(options) {
  const started = performance.now();
  const startedAtEpochMs = Date.now();
  const lifecycle = startLifecycle();
  const runId = randomUUID();
  const probeFile = resolve("out", `probe-${runId}.ndjson`);
  const probePath = pathToFileURL(resolve("src/probe/register.js")).href;
  const probeEvents = [];
  const memory = {
    samples: [],
    peaks: {
      peakRss: 0,
      peakHeapUsed: 0,
      peakExternal: 0,
      peakArrayBuffers: 0,
    },
  };
  const cpu = {
    samples: [],
    totalCpuMicros: 0,
    hottestSample: undefined,
  };
  const eventLoop = {
    samples: [],
    summary: {
      maxDelayMs: 0,
      meanDelayMs: 0,
      p95Ms: 0,
      p99Ms: 0,
    },
  };
  const handles = {
    samples: [],
    latest: undefined,
    summary: {
      categoryCounts: {},
      resourceCounts: {},
    },
  };
  const failures = {
    warnings: [],
    unhandledRejections: [],
    uncaughtExceptions: [],
  };
  const timeout = {
    timedOut: false,
    timeoutMs: options.timeoutMs,
  };
  const signals = {
    parentSignals: [],
    forwardedSignals: [],
    forceKilled: false,
  };
  const stdio = {
    stdout: { bytes: 0 },
    stderr: { bytes: 0 },
    events: [],
  };

  const recordChunk = (type, chunk) => {
    const bytes = chunk.length;
    const preview = chunk.toString("utf8", 0, Math.min(bytes, 160));
    stdio[type].bytes += bytes;
    stdio.events.push({
      type,
      at: Number((performance.now() - started).toFixed(3)),
      bytes,
      preview,
    });
  };

  return await new Promise((resolveRun, reject) => {
    const childArgs = [
      ...options.nodeFlags,
      "--import",
      probePath,
      options.target.path,
      ...options.targetArgs,
    ];

    const child = spawn(
      process.execPath,
      childArgs,
      {
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          FLIGHT_RECORDER_RUN_ID: runId,
          FLIGHT_RECORDER_PROBE_FILE: probeFile,
          FLIGHT_RECORDER_SAMPLE_MS: String(options.sampleMs),
          FLIGHT_RECORDER_STARTED_AT_EPOCH_MS: String(startedAtEpochMs),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let pid;
    let killTimer;
    let timeoutTimer;

    const eventAt = () => Number((performance.now() - started).toFixed(3));

    const clearKillTimer = () => {
      if (killTimer) clearTimeout(killTimer);
      killTimer = undefined;
    };

    const scheduleForceKill = () => {
      clearKillTimer();
      killTimer = setTimeout(() => {
        if (!isChildRunning(child)) return;
        signals.forceKilled = true;
        signals.forwardedSignals.push({ signal: "SIGKILL", at: eventAt(), forced: true });
        child.kill("SIGKILL");
      }, options.killTimeoutMs);
      killTimer.unref?.();
    };

    const requestShutdown = (signal, reason) => {
      if (!isChildRunning(child)) return;
      child.kill(signal);
      signals.forwardedSignals.push({ signal, at: eventAt(), forced: false, reason });
      scheduleForceKill();
    };

    const forwardSignal = (signal) => {
      signals.parentSignals.push({ signal, at: eventAt() });
      requestShutdown(signal, "parent-signal");
    };

    const onSigint = () => forwardSignal("SIGINT");
    const onSigterm = () => forwardSignal("SIGTERM");

    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);

    if (Number.isFinite(options.timeoutMs)) {
      timeoutTimer = setTimeout(() => {
        timeout.timedOut = true;
        requestShutdown("SIGTERM", "timeout");
      }, options.timeoutMs);
      timeoutTimer.unref?.();
    }

    child.once("spawn", () => {
      pid = child.pid;
      lifecycle.record.pid = child.pid;
    });

    child.once("error", reject);

    child.stdout.on("data", (chunk) => {
      recordChunk("stdout", chunk);
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      recordChunk("stderr", chunk);
      process.stderr.write(chunk);
    });

    child.once("close", async (exitCode, signal) => {
      try {
        clearKillTimer();
        if (timeoutTimer) clearTimeout(timeoutTimer);
        process.off("SIGINT", onSigint);
        process.off("SIGTERM", onSigterm);
        const finalLifecycle = finishLifecycle(lifecycle, { exitCode, signal });
        finalLifecycle.timedOut = timeout.timedOut;
        try {
          const text = await readFile(probeFile, "utf8");
          for (const line of text.split("\n")) {
            if (line.trim()) probeEvents.push(JSON.parse(line));
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        await mkdir("reports", { recursive: true });
        for (const event of probeEvents) {
          if (event.type !== "memory-sample") continue;
          memory.samples.push(event);
          memory.peaks.peakRss = Math.max(memory.peaks.peakRss, event.rss);
          memory.peaks.peakHeapUsed = Math.max(memory.peaks.peakHeapUsed, event.heapUsed);
          memory.peaks.peakExternal = Math.max(memory.peaks.peakExternal, event.external);
          memory.peaks.peakArrayBuffers = Math.max(memory.peaks.peakArrayBuffers, event.arrayBuffers);
        }
        for (const event of probeEvents) {
          if (event.type !== "cpu-sample") continue;
          cpu.samples.push(event);
          cpu.totalCpuMicros += event.totalMicros;
          if (!cpu.hottestSample || event.cpuPercent > cpu.hottestSample.cpuPercent) {
            cpu.hottestSample = event;
          }
        }
        for (const event of probeEvents) {
          if (event.type !== "event-loop-sample") continue;
          eventLoop.samples.push(event);
          eventLoop.summary.maxDelayMs = Math.max(eventLoop.summary.maxDelayMs, event.max / 1_000_000);
          eventLoop.summary.meanDelayMs = Math.max(eventLoop.summary.meanDelayMs, event.mean / 1_000_000);
          eventLoop.summary.p95Ms = Math.max(eventLoop.summary.p95Ms, event.p95 / 1_000_000);
          eventLoop.summary.p99Ms = Math.max(eventLoop.summary.p99Ms, event.p99 / 1_000_000);
        }
        for (const event of probeEvents) {
          if (event.type !== "active-handles") continue;
          const categoryCounts = {};
          for (const resource of event.resources) {
            const category = classifyResource(resource);
            categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
          }
          const sample = { ...event, categoryCounts };
          handles.samples.push(sample);
          handles.latest = sample;
        }
        if (handles.latest) {
          handles.summary.categoryCounts = handles.latest.categoryCounts;
          handles.summary.resourceCounts = handles.latest.resourceCounts;
        }
        for (const event of probeEvents) {
          if (event.type === "warning") failures.warnings.push(event);
          if (event.type === "unhandled-rejection") failures.unhandledRejections.push(event);
          if (event.type === "uncaught-exception") failures.uncaughtExceptions.push(event);
        }
        await writeFile("reports/stdio.json", `${JSON.stringify(stdio, null, 2)}\n`);
        await writeFile("reports/lifecycle.json", `${JSON.stringify(finalLifecycle, null, 2)}\n`);
        await writeFile("reports/signals.json", `${JSON.stringify({ ...signals, signal }, null, 2)}\n`);
        await writeFile("reports/probe.json", `${JSON.stringify({ runId, probeFile, events: probeEvents }, null, 2)}\n`);
        await writeFile("reports/memory.json", `${JSON.stringify(memory, null, 2)}\n`);
        await writeFile("reports/cpu.json", `${JSON.stringify(cpu, null, 2)}\n`);
        await writeFile("reports/event-loop.json", `${JSON.stringify(eventLoop, null, 2)}\n`);
        await writeFile("reports/handles.json", `${JSON.stringify(handles, null, 2)}\n`);
        await writeFile("reports/failures.json", `${JSON.stringify(failures, null, 2)}\n`);
        resolveRun({ pid, exitCode, signal, stdio, lifecycle: finalLifecycle, signals, probeEvents, memory, cpu, eventLoop, handles, failures });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function classifyResource(name) {
  const normalized = name.toLowerCase();
  if (normalized.includes("timeout") || normalized.includes("timer") || normalized.includes("immediate")) return "timer";
  if (normalized.includes("server")) return "server";
  if (normalized.includes("tcp") || normalized.includes("udp") || normalized.includes("socket")) return "socket";
  if (normalized.includes("tty") || normalized.includes("stdio")) return "stdio";
  if (normalized.includes("pipe") || normalized.includes("ipc")) return "ipc";
  return "unknown";
}
