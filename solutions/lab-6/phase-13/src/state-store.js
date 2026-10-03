import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class StateStore {
  constructor({ filePath = 'state/run.json' } = {}) {
    this.filePath = filePath;
    this.saveQueue = Promise.resolve();
  }

  async save(snapshot) {
    this.saveQueue = this.saveQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tempPath = this.filePath + '.tmp-' + process.pid + '-' + Date.now();
      await writeFile(tempPath, JSON.stringify(snapshot, null, 2) + '\n');
      await rename(tempPath, this.filePath);
    });

    return this.saveQueue;
  }

  async load() {
    const raw = await readFile(this.filePath, 'utf8');
    return JSON.parse(raw);
  }
}

export function countStatuses(tasksById) {
  const counts = {};
  for (const task of Object.values(tasksById)) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
  }
  return counts;
}
