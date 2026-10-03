import { TYPE_PUT } from "./record-format.js";
import { encodeRecord } from "./record-encode.js";
import { hexDump } from "./hex-dump.js";

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const [key, value] = process.argv.slice(2);

if (key === undefined || value === undefined) {
  fail("Usage: npm run encode -- <key> <value>");
} else {
  try {
    const record = encodeRecord({ type: TYPE_PUT, key, value });
    console.log(`length=${record.length}`);
    console.log(`hex=${record.toString("hex")}`);
    console.log(hexDump(record));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
