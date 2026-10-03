#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const [target, ...contentParts] = process.argv.slice(2);

  if (!target || contentParts.length === 0) {
    throw new Error("Usage: npm run simulate-atomic -- <target> '<content>'");
  }

  const absoluteTarget = path.resolve(process.cwd(), target);
  const directory = path.dirname(absoluteTarget);
  const base = path.basename(absoluteTarget);
  const tempPath = path.join(directory, `.${base}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);

  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, contentParts.join(' '), { flag: 'wx' });
  await rename(tempPath, absoluteTarget);
  console.log(`replaced ${path.relative(process.cwd(), absoluteTarget)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
