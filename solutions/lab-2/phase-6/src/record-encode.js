import {
  HEADER_SIZE,
  MAGIC,
  OFFSETS,
  TYPE_DELETE,
  TYPE_PUT,
  VERSION,
} from "./record-format.js";
import { writeRecordChecksum } from "./checksum.js";

const MAX_UINT32 = 0xffffffff;
const MAX_SAFE_UINT64_NUMBER = Number.MAX_SAFE_INTEGER;

function utf8Bytes(name, value) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  return Buffer.from(value, "utf8");
}

function validateLength(name, buffer) {
  if (buffer.length > MAX_UINT32) {
    throw new RangeError(`${name} is ${buffer.length} bytes; max is ${MAX_UINT32}`);
  }
}

function validateTimestamp(timestamp) {
  if (
    !Number.isInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > MAX_SAFE_UINT64_NUMBER
  ) {
    throw new RangeError("timestamp must be a non-negative safe integer");
  }
}

export function encodeRecord({
  type = TYPE_PUT,
  key,
  value = "",
  timestamp = Date.now(),
}) {
  if (type !== TYPE_PUT && type !== TYPE_DELETE) {
    throw new TypeError(`unknown record type: ${type}`);
  }

  validateTimestamp(timestamp);

  const keyBytes = utf8Bytes("key", key);
  const valueBytes = utf8Bytes("value", value);

  if (keyBytes.length === 0) {
    throw new RangeError("key must not be empty");
  }

  validateLength("key", keyBytes);
  validateLength("value", valueBytes);

  const recordLength = HEADER_SIZE + keyBytes.length + valueBytes.length;
  const buffer = Buffer.alloc(recordLength);

  MAGIC.copy(buffer, OFFSETS.magic);
  buffer.writeUInt8(VERSION, OFFSETS.version);
  buffer.writeUInt8(type, OFFSETS.type);
  buffer.writeUInt32BE(keyBytes.length, OFFSETS.keyLength);
  buffer.writeUInt32BE(valueBytes.length, OFFSETS.valueLength);
  buffer.writeBigUInt64BE(BigInt(timestamp), OFFSETS.timestamp);
  buffer.writeUInt32BE(0, OFFSETS.checksum);

  let offset = OFFSETS.payload;
  keyBytes.copy(buffer, offset);
  offset += keyBytes.length;
  valueBytes.copy(buffer, offset);
  offset += valueBytes.length;

  if (offset !== buffer.length) {
    throw new Error(`encoder wrote ${offset} bytes into ${buffer.length}-byte record`);
  }

  writeRecordChecksum(buffer);
  return buffer;
}
