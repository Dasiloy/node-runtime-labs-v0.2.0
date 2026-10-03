import { readFile } from "node:fs/promises";
import {
  HEADER_SIZE,
  MAGIC,
  OFFSETS,
  TYPE_DELETE,
  TYPE_PUT,
  VERSION,
  recordTypeName,
} from "./record-format.js";
import { verifyRecordChecksum } from "./checksum.js";

const PAYLOAD_MODES = new Set(["copy", "slice", "subarray"]);

export class DecodeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DecodeError";
    Object.assign(this, details);
  }
}

function assertAvailable(buffer, size, message, details = {}) {
  if (buffer.length < size) {
    throw new DecodeError(message, {
      available: buffer.length,
      required: size,
      ...details,
    });
  }
}

function payloadView(buffer, start, end, mode) {
  if (mode === "copy") {
    return Buffer.from(buffer.subarray(start, end));
  }
  if (mode === "slice") {
    return buffer.slice(start, end);
  }
  return buffer.subarray(start, end);
}

export function decodeRecord(buffer, options = {}) {
  const payloadMode = options.payloadMode ?? "copy";

  if (!PAYLOAD_MODES.has(payloadMode)) {
    throw new TypeError(`payloadMode must be one of: ${Array.from(PAYLOAD_MODES).join(", ")}`);
  }

  assertAvailable(buffer, HEADER_SIZE, "incomplete header", {
    reason: "incomplete-header",
  });

  const magic = buffer.subarray(OFFSETS.magic, OFFSETS.magic + MAGIC.length);
  if (!magic.equals(MAGIC)) {
    throw new DecodeError("invalid magic bytes", { reason: "invalid-magic" });
  }

  const version = buffer.readUInt8(OFFSETS.version);
  if (version !== VERSION) {
    throw new DecodeError(`unsupported record version: ${version}`, {
      reason: "unsupported-version",
      version,
    });
  }

  const type = buffer.readUInt8(OFFSETS.type);
  if (type !== TYPE_PUT && type !== TYPE_DELETE) {
    throw new DecodeError(`unknown record type: ${type}`, {
      reason: "unknown-type",
      type,
    });
  }

  const keyLength = buffer.readUInt32BE(OFFSETS.keyLength);
  const valueLength = buffer.readUInt32BE(OFFSETS.valueLength);
  const recordLength = HEADER_SIZE + keyLength + valueLength;

  assertAvailable(buffer, recordLength, "incomplete payload", {
    reason: "incomplete-payload",
    recordLength,
  });

  if (options.verifyChecksum !== false) {
    const checksum = verifyRecordChecksum(buffer.subarray(0, recordLength));
    if (!checksum.ok) {
      throw new DecodeError("checksum mismatch", {
        reason: "checksum-mismatch",
        storedChecksum: checksum.storedChecksum,
        computedChecksum: checksum.computedChecksum,
      });
    }
  }

  const keyStart = OFFSETS.payload;
  const keyEnd = keyStart + keyLength;
  const valueStart = keyEnd;
  const valueEnd = valueStart + valueLength;
  const keyBuffer = payloadView(buffer, keyStart, keyEnd, payloadMode);
  const valueBuffer = payloadView(buffer, valueStart, valueEnd, payloadMode);
  const timestampBigInt = buffer.readBigUInt64BE(OFFSETS.timestamp);

  if (timestampBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DecodeError(`timestamp exceeds safe integer range: ${timestampBigInt}`, {
      reason: "unsafe-timestamp",
      timestamp: timestampBigInt.toString(),
    });
  }

  return {
    type,
    typeName: recordTypeName(type),
    key: keyBuffer.toString("utf8"),
    value: valueBuffer.toString("utf8"),
    timestamp: Number(timestampBigInt),
    checksum: buffer.readUInt32BE(OFFSETS.checksum),
    keyLength,
    valueLength,
    recordLength,
    payloadOffset: OFFSETS.payload,
    keyBuffer,
    valueBuffer,
  };
}

export async function decodeRecordFile(path, options = {}) {
  return decodeRecord(await readFile(path), options);
}
