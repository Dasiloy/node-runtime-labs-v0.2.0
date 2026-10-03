export const MAGIC_TEXT = "NBGW";
export const MAGIC = Buffer.from(MAGIC_TEXT, "ascii");
export const VERSION = 1;
export const HEADER_SIZE = 24;
export const MAX_PAYLOAD_BYTES = 1_048_576;

export const TYPE_EVENT = 1;
export const TYPE_HEARTBEAT = 2;
export const TYPE_ACK = 3;
export const TYPE_ERROR = 4;

export const FRAME_TYPES = Object.freeze({
  [TYPE_EVENT]: "EVENT",
  [TYPE_HEARTBEAT]: "HEARTBEAT",
  [TYPE_ACK]: "ACK",
  [TYPE_ERROR]: "ERROR"
});

export const HEADER_FIELDS = Object.freeze([
  {
    offset: 0,
    width: 4,
    field: "magic",
    type: "ASCII bytes",
    validation: `Must equal ${MAGIC_TEXT}`
  },
  {
    offset: 4,
    width: 1,
    field: "version",
    type: "uint8",
    validation: `Must equal ${VERSION}`
  },
  {
    offset: 5,
    width: 1,
    field: "frame type",
    type: "uint8",
    validation: "Must be 1 EVENT, 2 HEARTBEAT, 3 ACK, or 4 ERROR"
  },
  {
    offset: 6,
    width: 2,
    field: "flags",
    type: "uint16be",
    validation: "Must equal 0 until a later extension defines flags"
  },
  {
    offset: 8,
    width: 8,
    field: "request id",
    type: "uint64be",
    validation: "Unsigned 64-bit request id"
  },
  {
    offset: 16,
    width: 4,
    field: "payload length",
    type: "uint32be",
    validation: `Must be <= ${MAX_PAYLOAD_BYTES}`
  },
  {
    offset: 20,
    width: 4,
    field: "checksum",
    type: "uint32be",
    validation: "CRC32 of header bytes with this field zeroed plus payload bytes"
  },
  {
    offset: 24,
    width: "...",
    field: "payload",
    type: "bytes",
    validation: "UTF-8 JSON for EVENT, ACK, and ERROR frames; empty for HEARTBEAT"
  }
]);

export function formatProtocol() {
  const lines = [
    "Custom Binary Protocol",
    "",
    `MAGIC = ${MAGIC_TEXT} (${MAGIC.toString("hex")})`,
    `VERSION = ${VERSION}`,
    `HEADER_SIZE = ${HEADER_SIZE}`,
    `MAX_PAYLOAD_BYTES = ${MAX_PAYLOAD_BYTES}`,
    "",
    "Frame types:"
  ];

  for (const [value, name] of Object.entries(FRAME_TYPES)) {
    lines.push(`  ${value.padStart(2, " ")} ${name}`);
  }

  lines.push("", "Header layout:", "");
  lines.push("| Offset | Width | Field | Type | Validation |");
  lines.push("| ---: | ---: | --- | --- | --- |");
  for (const field of HEADER_FIELDS) {
    lines.push(
      `| ${field.offset} | ${field.width} | ${field.field} | ${field.type} | ${field.validation} |`
    );
  }

  return lines.join("\n");
}
