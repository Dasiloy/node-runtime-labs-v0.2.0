import { crc32 } from "node:zlib";
import { OFFSETS, WIDTHS } from "./record-format.js";

export function checksumRecordBytes(buffer) {
  const copy = Buffer.from(buffer);
  copy.fill(0, OFFSETS.checksum, OFFSETS.checksum + WIDTHS.checksum);
  return crc32(copy) >>> 0;
}

export function writeRecordChecksum(buffer) {
  const checksum = checksumRecordBytes(buffer);
  buffer.writeUInt32BE(checksum, OFFSETS.checksum);
  return checksum;
}

export function verifyRecordChecksum(buffer) {
  const storedChecksum = buffer.readUInt32BE(OFFSETS.checksum);
  const computedChecksum = checksumRecordBytes(buffer);

  return {
    ok: storedChecksum === computedChecksum,
    storedChecksum,
    computedChecksum,
  };
}
