import { open } from "node:fs/promises";
import {
  HEADER_SIZE,
  MAGIC,
  OFFSETS,
  TYPE_DELETE,
  TYPE_PUT,
  VERSION,
} from "./record-format.js";
import { decodeRecord, DecodeError } from "./record-decode.js";
import { SEGMENT_PATH } from "./paths.js";

export class SegmentReadError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SegmentReadError";
    Object.assign(this, details);
  }
}

export async function readExactly(handle, position, length) {
  const buffer = Buffer.alloc(length);
  let bytesRead = 0;

  while (bytesRead < length) {
    const result = await handle.read(
      buffer,
      bytesRead,
      length - bytesRead,
      position + bytesRead,
    );

    if (result.bytesRead === 0) {
      break;
    }

    bytesRead += result.bytesRead;
  }

  return { buffer, bytesRead };
}

function validateHeaderForLength(header, offset) {
  if (!header.subarray(OFFSETS.magic, OFFSETS.magic + MAGIC.length).equals(MAGIC)) {
    throw new SegmentReadError("invalid magic bytes", {
      reason: "invalid-magic",
      offset,
    });
  }

  const version = header.readUInt8(OFFSETS.version);
  if (version !== VERSION) {
    throw new SegmentReadError(`unsupported record version: ${version}`, {
      reason: "unsupported-version",
      offset,
      version,
    });
  }

  const type = header.readUInt8(OFFSETS.type);
  if (type !== TYPE_PUT && type !== TYPE_DELETE) {
    throw new SegmentReadError(`unknown record type: ${type}`, {
      reason: "unknown-type",
      offset,
      type,
    });
  }

  return {
    keyLength: header.readUInt32BE(OFFSETS.keyLength),
    valueLength: header.readUInt32BE(OFFSETS.valueLength),
  };
}

async function readRecordFromHandle(handle, offset, options = {}) {
  const headerRead = await readExactly(handle, offset, HEADER_SIZE);

  if (headerRead.bytesRead === 0) {
    return null;
  }

  if (headerRead.bytesRead < HEADER_SIZE) {
    throw new SegmentReadError("incomplete header", {
      reason: "incomplete-header",
      offset,
      available: headerRead.bytesRead,
      required: HEADER_SIZE,
    });
  }

  const { keyLength, valueLength } = validateHeaderForLength(headerRead.buffer, offset);
  const payloadLength = keyLength + valueLength;
  const payloadRead = await readExactly(handle, offset + HEADER_SIZE, payloadLength);

  if (payloadRead.bytesRead < payloadLength) {
    throw new SegmentReadError("incomplete payload", {
      reason: "incomplete-payload",
      offset,
      available: payloadRead.bytesRead,
      required: payloadLength,
    });
  }

  const recordBuffer = Buffer.concat([headerRead.buffer, payloadRead.buffer], HEADER_SIZE + payloadLength);

  try {
    const record = decodeRecord(recordBuffer, options);
    return { offset, length: record.recordLength, record };
  } catch (error) {
    if (error instanceof DecodeError) {
      error.offset = offset;
    }
    throw error;
  }
}

export async function readRecordAt(segment = SEGMENT_PATH, offset = 0, options = {}) {
  const handle = await open(segment, "r");

  try {
    const entry = await readRecordFromHandle(handle, offset, options);
    if (entry === null) {
      throw new SegmentReadError("no record at offset", {
        reason: "no-record",
        offset,
      });
    }
    return entry;
  } finally {
    await handle.close();
  }
}

export async function* scanSegment(segment = SEGMENT_PATH, options = {}) {
  let handle;

  try {
    handle = await open(segment, "r");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  try {
    let offset = 0;

    while (true) {
      const entry = await readRecordFromHandle(handle, offset, options);
      if (entry === null) {
        return;
      }
      yield entry;
      offset += entry.length;
    }
  } finally {
    await handle.close();
  }
}
