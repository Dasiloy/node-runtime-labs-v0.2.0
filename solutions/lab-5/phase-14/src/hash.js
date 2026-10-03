import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function hashFile(absolutePath) {
  const hash = createHash('sha256');
  let bytes = 0;

  for await (const chunk of createReadStream(absolutePath)) {
    bytes += chunk.byteLength;
    hash.update(chunk);
  }

  return {
    algorithm: 'sha256',
    digest: hash.digest('hex'),
    bytes
  };
}
