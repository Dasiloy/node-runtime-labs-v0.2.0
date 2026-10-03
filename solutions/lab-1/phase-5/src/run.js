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
        await writeFile("reports/stdio.json", `${JSON.stringify(stdio, null, 2)}\n`);
        await writeFile("reports/lifecycle.json", `${JSON.stringify(finalLifecycle, null, 2)}\n`);
        await writeFile("reports/signals.json", `${JSON.stringify({ ...signals, signal }, null, 2)}\n`);
        await writeFile("reports/probe.json", `${JSON.stringify({ runId, probeFile, events: probeEvents }, null, 2)}\n`);
        resolveRun({ pid, exitCode, signal, stdio, lifecycle: finalLifecycle, signals, probeEvents });
      } catch (error) {
        reject(error);
      }
    });
  });
}
