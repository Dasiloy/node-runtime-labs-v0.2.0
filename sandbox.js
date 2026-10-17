import { Buffer } from "node:buffer";

const buf = Buffer.from([0x12, 0x34, 0x56]);

console.log(buf.readUInt16BE(0).toString(16));


console.log(Buffer.poolsize)
