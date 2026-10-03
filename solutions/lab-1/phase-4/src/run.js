import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { finishLifecycle, startLifecycle } from "./lifecycle.js";

export function isChildRunning(child) {
  return child.exitCode === null && child.signalCode === null;
}

export async function run(options) {
  const started = performance.now();
  const lifecycle = startLifecycle();
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

  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [options.target.path, ...options.targetArgs],
      {
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let pid;
    let killTimer;

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

    const forwardSignal = (signal) => {
      signals.parentSignals.push({ signal, at: eventAt() });
      if (!isChildRunning(child)) return;
      child.kill(signal);
      signals.forwardedSignals.push({ signal, at: eventAt(), forced: false });
      scheduleForceKill();
    };

    const onSigint = () => forwardSignal("SIGINT");
    const onSigterm = () => forwardSignal("SIGTERM");

    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);

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
        process.off("SIGINT", onSigint);
        process.off("SIGTERM", onSigterm);
        const finalLifecycle = finishLifecycle(lifecycle, { exitCode, signal });
        await mkdir("reports", { recursive: true });
        await writeFile("reports/stdio.json", `${JSON.stringify(stdio, null, 2)}\n`);
        await writeFile("reports/lifecycle.json", `${JSON.stringify(finalLifecycle, null, 2)}\n`);
        await writeFile("reports/signals.json", `${JSON.stringify({ ...signals, signal }, null, 2)}\n`);
        resolve({ pid, exitCode, signal, stdio, lifecycle: finalLifecycle, signals });
      } catch (error) {
        reject(error);
      }
    });
  });
}
