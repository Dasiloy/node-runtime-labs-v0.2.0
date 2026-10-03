import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function readJsonl(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function line(label, value) {
  return `- ${label}: ${value}`;
}

export async function generateWatchReport({
  reportsDir = path.resolve(process.cwd(), 'reports'),
  filesystemRule = 'Treat filesystem events as prompts to rescan and prove final state before rebuilding.'
} = {}) {
  const [
    scan,
    diff,
    watchState,
    shutdown,
    logicalEvents,
    rawEvents,
    batches,
    queue,
    rebuilds
  ] = await Promise.all([
    readJson(path.join(reportsDir, 'scan.json')),
    readJson(path.join(reportsDir, 'diff.json')),
    readJson(path.join(reportsDir, 'watch-state.json')),
    readJson(path.join(reportsDir, 'shutdown.json')),
    readJson(path.join(reportsDir, 'logical-events.json')),
    readJsonl(path.join(reportsDir, 'events.jsonl')),
    readJsonl(path.join(reportsDir, 'batches.jsonl')),
    readJsonl(path.join(reportsDir, 'queue.jsonl')),
    readJsonl(path.join(reportsDir, 'rebuilds.jsonl'))
  ]);

  const queueHighWater = queue.reduce((max, sample) => Math.max(max, sample.active ?? 0), 0);
  const cacheHits = rebuilds.reduce((sum, record) => sum + (record.cacheHits?.length ?? 0), 0);
  const cacheMisses = rebuilds.reduce((sum, record) => sum + (record.cacheMisses?.length ?? 0), 0);
  const rebuilt = rebuilds.reduce((sum, record) => sum + (record.rebuilt?.length ?? 0), 0);
  const skipped = (scan?.skipped?.length ?? 0) + rebuilds.reduce((sum, record) => sum + (record.skipped?.length ?? 0), 0);
  const errors = (scan?.errors?.length ?? 0) + rebuilds.reduce((sum, record) => sum + (record.failed?.length ?? 0), 0);

  const markdown = [
    '# Watch Session Report',
    '',
    '## Command Options',
    line('watched root', scan?.root ?? 'missing'),
    line('mode', watchState?.mode ?? 'missing'),
    line('debounce', watchState?.debounceMs == null ? 'missing' : `${watchState.debounceMs}ms`),
    line('poll interval', watchState?.pollIntervalMs ?? 'native watcher'),
    line('concurrency', watchState?.queue?.concurrency ?? 'missing'),
    '',
    '## Scan And Diff',
    line('files', scan?.counts?.files ?? 0),
    line('directories', scan?.counts?.directories ?? 0),
    line('ignored', scan?.counts?.ignored ?? 0),
    line('skipped', scan?.counts?.skipped ?? 0),
    line('added', diff?.counts?.added ?? 0),
    line('changed', diff?.counts?.changed ?? 0),
    line('deleted', diff?.counts?.deleted ?? 0),
    line('unchanged', diff?.counts?.unchanged ?? 0),
    '',
    '## Events And Batches',
    line('raw events', rawEvents.length),
    line('logical groups', logicalEvents?.length ?? 0),
    line('batches', batches.length),
    line('queue high water', queueHighWater),
    '',
    '## Rebuild Cache',
    line('rebuild records', rebuilds.length),
    line('cache hits', cacheHits),
    line('cache misses', cacheMisses),
    line('rebuilt', rebuilt),
    line('skipped work', skipped),
    line('errors', errors),
    '',
    '## Shutdown',
    line('reason', shutdown?.reason ?? 'missing'),
    line('signal', shutdown?.signal ?? 'none'),
    line('cache saved', shutdown?.cacheSaved ?? false),
    line('closed watchers', shutdown?.closed?.watchers ?? 0),
    line('closed pollers', shutdown?.closed?.pollers ?? 0),
    '',
    '## Filesystem Rule',
    filesystemRule,
    ''
  ].join('\n');

  await mkdir(reportsDir, { recursive: true });
  await writeFile(path.join(reportsDir, 'watch-report.md'), markdown);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Watch Session Report</title>
  <style>body{font-family:system-ui,sans-serif;max-width:860px;margin:40px auto;line-height:1.5}code{background:#eee;padding:2px 4px}</style>
</head>
<body>
${markdown
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .split('\n')
  .map((text) => {
    if (text.startsWith('# ')) return `<h1>${text.slice(2)}</h1>`;
    if (text.startsWith('## ')) return `<h2>${text.slice(3)}</h2>`;
    if (text.startsWith('- ')) return `<p>${text}</p>`;
    if (!text) return '';
    return `<p>${text}</p>`;
  })
  .join('\n')}
</body>
</html>
`;
  await writeFile(path.join(reportsDir, 'watch-report.html'), html);
  return { markdownPath: path.join(reportsDir, 'watch-report.md') };
}
