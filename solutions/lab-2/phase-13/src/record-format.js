export const MAGIC_TEXT = "NLOG";
export const MAGIC = Buffer.from(MAGIC_TEXT, "ascii");
export const VERSION = 1;

export const TYPE_PUT = 1;
export const TYPE_DELETE = 2;

export const TYPE_NAMES = new Map([
  [TYPE_PUT, "PUT"],
  [TYPE_DELETE, "DELETE"],
]);

export const HEADER_SIZE = 28;

export const OFFSETS = Object.freeze({
  magic: 0,
  version: 4,
  type: 5,
  reserved: 6,
  keyLength: 8,
  valueLength: 12,
  timestamp: 16,
  checksum: 24,
  payload: HEADER_SIZE,
});

export const WIDTHS = Object.freeze({
  magic: 4,
  version: 1,
  type: 1,
  reserved: 2,
  keyLength: 4,
  valueLength: 4,
  timestamp: 8,
  checksum: 4,
});

export const HEADER_FIELDS = Object.freeze([
  {
    offset: OFFSETS.magic,
    width: WIDTHS.magic,
    field: "magic",
    rule: `${MAGIC_TEXT} ASCII bytes`,
  },
  {
    offset: OFFSETS.version,
    width: WIDTHS.version,
    field: "version",
    rule: String(VERSION),
  },
  {
    offset: OFFSETS.type,
    width: WIDTHS.type,
    field: "type",
    rule: `${TYPE_PUT}=PUT, ${TYPE_DELETE}=DELETE`,
  },
  {
    offset: OFFSETS.reserved,
    width: WIDTHS.reserved,
    field: "reserved",
    rule: "zero-filled",
  },
  {
    offset: OFFSETS.keyLength,
    width: WIDTHS.keyLength,
    field: "keyLength",
    rule: "uint32 big-endian byte length",
  },
  {
    offset: OFFSETS.valueLength,
    width: WIDTHS.valueLength,
    field: "valueLength",
    rule: "uint32 big-endian byte length",
  },
  {
    offset: OFFSETS.timestamp,
    width: WIDTHS.timestamp,
    field: "timestamp",
    rule: "uint64 big-endian Unix epoch ms",
  },
  {
    offset: OFFSETS.checksum,
    width: WIDTHS.checksum,
    field: "checksum",
    rule: "uint32 big-endian CRC-32, checksum bytes zeroed",
  },
]);

export function recordTypeName(type) {
  return TYPE_NAMES.get(type) ?? `UNKNOWN(${type})`;
}
