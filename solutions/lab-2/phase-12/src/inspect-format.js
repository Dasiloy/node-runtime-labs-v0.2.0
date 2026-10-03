import {
  HEADER_FIELDS,
  HEADER_SIZE,
  MAGIC_TEXT,
  OFFSETS,
  TYPE_DELETE,
  TYPE_PUT,
  VERSION,
} from "./record-format.js";

function pad(value, width) {
  return String(value).padEnd(width);
}

console.log(`Record format: ${MAGIC_TEXT} version ${VERSION}`);
console.log(`HEADER_SIZE = ${HEADER_SIZE}`);
console.log(`Payload starts at offset ${OFFSETS.payload}`);
console.log("");
console.log(`${pad("offset", 8)}${pad("width", 8)}${pad("field", 16)}rule`);

for (const field of HEADER_FIELDS) {
  console.log(
    `${pad(field.offset, 8)}${pad(field.width, 8)}${pad(field.field, 16)}${field.rule}`,
  );
}

console.log("");
console.log("Payload order: key bytes followed by value bytes");
console.log("Byte order: numeric fields are big-endian");
console.log("Text encoding: keys and values are UTF-8 bytes");
console.log(`Record types: ${TYPE_PUT}=PUT, ${TYPE_DELETE}=DELETE`);
