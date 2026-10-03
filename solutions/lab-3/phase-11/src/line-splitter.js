import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

function stripTrailingCarriageReturn(line) {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

export function createLineSplitter() {
  const decoder = new StringDecoder('utf8');
  let carry = '';

  return new Transform({
    readableObjectMode: true,
    transform(chunk, encoding, callback) {
      carry += decoder.write(chunk);
      const parts = carry.split('\n');
      carry = parts.pop() ?? '';

      for (const part of parts) {
        this.push(stripTrailingCarriageReturn(part));
      }

      callback();
    },
    flush(callback) {
      carry += decoder.end();

      if (carry.length > 0) {
        this.push(stripTrailingCarriageReturn(carry));
      }

      callback();
    },
  });
}
