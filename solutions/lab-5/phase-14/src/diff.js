function filesByPathFromInventory(inventory) {
  if (inventory?.filesByPath) {
    return inventory.filesByPath;
  }

  return Object.fromEntries((inventory?.files ?? []).map((record) => [record.path, record]));
}

function pickComparable(record) {
  return {
    hash: record.hash,
    size: record.size,
    mtimeMs: record.mtimeMs,
    ctimeMs: record.ctimeMs,
    mode: record.mode,
    identity: record.identity,
    type: record.type
  };
}

function changeReasons(previous, current) {
  const previousComparable = pickComparable(previous);
  const currentComparable = pickComparable(current);
  const reasons = [];

  for (const key of Object.keys(previousComparable)) {
    if (previousComparable[key] !== currentComparable[key]) {
      reasons.push(key);
    }
  }

  return reasons;
}

export function diffInventories(previous, current) {
  const previousFiles = filesByPathFromInventory(previous);
  const currentFiles = filesByPathFromInventory(current);
  const previousPaths = new Set(Object.keys(previousFiles));
  const currentPaths = new Set(Object.keys(currentFiles));

  const added = [];
  const changed = [];
  const deleted = [];
  const unchanged = [];

  for (const filePath of [...currentPaths].sort()) {
    if (!previousPaths.has(filePath)) {
      added.push({
        path: filePath,
        current: currentFiles[filePath]
      });
      continue;
    }

    const previousRecord = previousFiles[filePath];
    const currentRecord = currentFiles[filePath];
    const reasons = changeReasons(previousRecord, currentRecord);

    if (reasons.length > 0) {
      changed.push({
        path: filePath,
        reasons,
        previous: previousRecord,
        current: currentRecord
      });
    } else {
      unchanged.push(filePath);
    }
  }

  for (const filePath of [...previousPaths].sort()) {
    if (!currentPaths.has(filePath)) {
      deleted.push({
        path: filePath,
        previous: previousFiles[filePath]
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      added: added.length,
      changed: changed.length,
      deleted: deleted.length,
      unchanged: unchanged.length
    },
    added,
    changed,
    deleted,
    unchanged
  };
}
