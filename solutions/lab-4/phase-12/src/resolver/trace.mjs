export function createReport(importer, specifier, options) {
  return {
    importer,
    specifier,
    mode: options.mode,
    conditions: options.conditions,
    format: options.format,
    preserveSymlinks: options.preserveSymlinks,
    consumerFormat: options.consumerFormat ?? (options.mode === 'import' ? 'esm' : 'cjs'),
    importedName: options.importedName,
    attempts: [],
    packageCandidates: [],
    activeConditions: [],
    conditionChecks: [],
    metadata: [],
    symlinks: [],
    warnings: [],
    errors: [],
    status: 'pending',
  };
}

export function addAttempt(report, event) {
  report.attempts.push({
    path: event.path,
    kind: event.kind,
    result: event.result,
    reason: event.reason,
    ...event,
  });
}

export function addMetadata(report, event) {
  report.metadata.push(event);
}

export function addWarning(report, warning) {
  report.warnings.push(warning);
}

export function addError(report, error) {
  report.errors.push(error);
  report.status = 'failed';
}

export function markResolved(report, resolvedPath, extra = {}) {
  report.resolvedPath = resolvedPath;
  report.status = 'resolved';
  Object.assign(report, extra);
}
