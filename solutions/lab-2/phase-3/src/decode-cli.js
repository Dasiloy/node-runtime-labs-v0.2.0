import { readFile } from "node:fs/promises";
import { decodeRecord } from "./record-decode.js";

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = [...argv];
  const fileIndex = args.indexOf("--file");

  if (fileIndex !== -1) {
    const file = args[fileIndex + 1];
    if (file === undefined) {
      throw new Error("--file requires a path");
    }
    return { file };
  }

  const rawHex = args.join("").replace(/^hex=/, "");
  const hex = rawHex.replace(/[^a-fA-F0-9]/g, "");

  if (hex.length === 0) {
    throw new Error("Usage: npm run decode -- <hex> OR npm run decode -- --file <path>");
  }

  if (hex.length % 2 !== 0) {
    throw new Error("hex input must contain an even number of digits");
  }

  return { hex };
}

try {
  const input = parseArgs(process.argv.slice(2));
  const buffer = input.file === undefined ? Buffer.from(input.hex, "hex") : await readFile(input.file);
  const record = decodeRecord(buffer);
  console.log(
    JSON.stringify(
      {
        type: record.typeName,
        key: record.key,
        value: record.value,
        timestamp: record.timestamp,
        checksum: record.checksum,
        keyLength: record.keyLength,
        valueLength: record.valueLength,
        recordLength: record.recordLength,
        payloadOffset: record.payloadOffset,
      },
      null,
      2,
    ),
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
