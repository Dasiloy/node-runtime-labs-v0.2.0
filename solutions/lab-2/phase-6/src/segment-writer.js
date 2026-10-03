import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { TYPE_PUT } from "./record-format.js";
import { encodeRecord } from "./record-encode.js";
import { SEGMENT_PATH } from "./paths.js";

async function writeAll(handle, buffer) {
  let written = 0;

  while (written < buffer.length) {
    const result = await handle.write(
      buffer,
      written,
      buffer.length - written,
      null,
    );

    if (result.bytesWritten === 0) {
      throw new Error("segment write made no progress");
    }

    written += result.bytesWritten;
  }
}

export async function appendRecord({
  segment = SEGMENT_PATH,
  type = TYPE_PUT,
  key,
  value,
  timestamp = Date.now(),
  sync = false,
}) {
  await mkdir(dirname(segment), { recursive: true });

  const record = encodeRecord({ type, key, value, timestamp });
  const handle = await fsOpen(segment, "a+");

  try {
    const before = await handle.stat();
    const offset = before.size;
    await writeAll(handle, record);

    if (sync) {
      await handle.sync();
    }

    return {
      segment,
      offset,
      length: record.length,
      timestamp,
      synced: sync,
    };
  } finally {
    await handle.close();
  }
}

async function fsOpen(path, flags) {
  const { open } = await import("node:fs/promises");
  return open(path, flags);
}
