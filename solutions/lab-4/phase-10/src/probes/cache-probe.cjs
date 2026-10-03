const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;
const loadEvents = [];
const partialObservations = [];

Module._load = function inspectedLoad(request, parent, isMain) {
  let resolved = null;
  let cacheHitBefore = false;

  try {
    resolved = Module._resolveFilename(request, parent, isMain);
    cacheHitBefore = Boolean(Module._cache[resolved]);
    if (Module._cache[resolved] && Module._cache[resolved].loaded === false) {
      partialObservations.push({
        request,
        parent: parent?.filename ?? null,
        resolved,
        exportedKeys: Object.keys(Module._cache[resolved].exports),
      });
    }
  } catch (error) {
    resolved = null;
  }

  loadEvents.push({
    request,
    parent: parent?.filename ?? null,
    resolved,
    cacheHitBefore,
    isMain: Boolean(isMain),
  });

  return originalLoad.apply(this, arguments);
};

process.on('exit', () => {
  const reportPath = process.env.MODULE_INSPECTOR_CACHE_REPORT;
  if (!reportPath) {
    return;
  }

  const entries = Object.values(require.cache).map((module) => ({
    id: module.id,
    filename: module.filename,
    loaded: module.loaded,
    children: module.children.map((child) => child.filename),
  }));

  const report = {
    entry: path.resolve(process.argv[1] ?? ''),
    pid: process.pid,
    preserveSymlinks: process.execArgv.includes('--preserve-symlinks'),
    cacheEntries: entries,
    loadEvents,
    partialObservations,
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
});
