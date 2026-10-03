import { decodeFrame } from "./frame-decode.js";

export function runDecodeCommand(args) {
  if (args.includes("--help")) {
    console.log(`Usage: node src/cli.js decode <hex>

The hex string may contain spaces and line breaks.`);
    return;
  }

  const hex = args.join("").replace(/\s+/g, "");
  if (!hex) {
    throw new Error("Missing hex frame input");
  }

  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error("Frame input must be hexadecimal bytes");
  }

  const decoded = decodeFrame(Buffer.from(hex, "hex"));
  console.log(JSON.stringify(decoded, null, 2));
}
