import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function writeJsonReport(state, destination) {
  const report = buildJsonReport(state);
  await mkdir(dirname(destination), { recursive: true });
  const tempPath = join(dirname(destination), `.${Date.now()}-${process.pid}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(report, null, 2)}\n`);
  await rename(tempPath, destination);
  return report;
}

export function buildJsonReport(state) {
  const timeline = buildTimeline(state);

  return {
    schemaVersion: 1,
    runId: state.runId,
    command: state.command,
    startedAt: state.lifecycle.startedAt,
    endedAt: state.lifecycle.exitedAt,
    durationMs: state.lifecycle.elapsedMs,
    node: {
      version: state.startup.nodeVersion,
      execPath: state.startup.execPath,
      execArgv: state.startup.execArgv,
      nodeFlags: state.startup.nodeFlags,
      envFiles: state.startup.envFiles,
      envFileKeys: state.startup.envFileKeys,
      envOverrides: state.startup.envOverrides,
    },
    lifecycle: state.lifecycle,
    stdio: state.stdio,
    memory: state.memory,
    cpu: state.cpu,
    eventLoop: state.eventLoop,
    handles: state.handles,
    failures: state.failures,
    timeline,
  };
}

function buildTimeline(state) {
  let sequence = 0;
  const events = [];

  const push = (at, type, source, data) => {
    events.push({ at, type, source, data, _seq: sequence });
    sequence += 1;
  };

  push(0, "lifecycle-start", "parent", { startedAt: state.lifecycle.startedAt });

  for (const event of state.stdio.events) {
    push(event.at, event.type, "child-stdio", {
      bytes: event.bytes,
      preview: event.preview,
    });
  }

  for (const event of state.signals.parentSignals) {
    push(event.at, "parent-signal", "parent", event);
  }

  for (const event of state.signals.forwardedSignals) {
    push(event.at, "forwarded-signal", "parent", event);
  }

  for (const event of state.probeEvents) {
    const { at, type, ...data } = event;
    push(at, type, "probe", data);
  }

  push(state.lifecycle.elapsedMs ?? 0, "lifecycle-close", "parent", {
    exitCode: state.lifecycle.exitCode,
    signal: state.lifecycle.signal,
    timedOut: state.lifecycle.timedOut,
  });

  return events
    .sort((left, right) => left.at - right.at || left._seq - right._seq)
    .map(({ _seq, ...event }) => event);
}
