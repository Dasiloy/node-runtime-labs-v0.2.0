import path from 'node:path';

export function isTempPath(relativePath) {
  if (!relativePath) return false;
  const base = path.posix.basename(relativePath);
  return (
    (base.startsWith('.') && base.endsWith('.tmp')) ||
    base.endsWith('~') ||
    base.endsWith('.swp') ||
    base.endsWith('.tmp')
  );
}

function tempToCandidate(relativePath) {
  const directory = path.posix.dirname(relativePath);
  const base = path.posix.basename(relativePath);
  let candidate = base;

  if (candidate.startsWith('.')) {
    candidate = candidate.slice(1);
  }
  candidate = candidate
    .replace(/\.tmp$/u, '')
    .replace(/\.swp$/u, '')
    .replace(/~$/u, '');

  return directory === '.' ? candidate : `${directory}/${candidate}`;
}

export function createLogicalEvents({ batchId, rawEvents, diff }) {
  const tempPaths = [...new Set(rawEvents
    .map((event) => event.relativePath)
    .filter(isTempPath))]
    .sort();

  const rawEventIds = rawEvents.map((event) => event.id);
  const changedPaths = [
    ...diff.added.map((entry) => ({ path: entry.path, kind: 'add', reasons: ['path'] })),
    ...diff.changed.map((entry) => ({ path: entry.path, kind: 'change', reasons: entry.reasons })),
    ...diff.deleted.map((entry) => ({ path: entry.path, kind: 'delete', reasons: ['missing'] }))
  ].sort((left, right) => left.path.localeCompare(right.path));

  const candidateTargets = new Set(tempPaths.map(tempToCandidate));
  const logical = [];

  for (const entry of changedPaths) {
    const matchingTempPaths = tempPaths.filter((tempPath) => (
      path.posix.dirname(tempPath) === path.posix.dirname(entry.path) ||
      candidateTargets.has(entry.path)
    ));
    const kind = matchingTempPaths.length > 0 && entry.kind === 'change'
      ? 'atomic-replace'
      : entry.kind;

    logical.push({
      batchId,
      kind,
      path: entry.path,
      reasons: entry.reasons,
      tempPaths: matchingTempPaths,
      rawEventIds
    });
  }

  if (logical.length === 0 && tempPaths.length > 0) {
    for (const tempPath of tempPaths) {
      logical.push({
        batchId,
        kind: 'temp-write',
        path: tempToCandidate(tempPath),
        reasons: ['temp-path'],
        tempPaths: [tempPath],
        rawEventIds
      });
    }
  }

  return logical;
}
