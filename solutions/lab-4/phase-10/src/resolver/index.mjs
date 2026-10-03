import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReport, addError } from './trace.mjs';
import { isBuiltinSpecifier, resolveBuiltin } from './builtins.mjs';
import { applyInteropWarnings } from './interop.mjs';
import { resolvePackageSpecifier } from './packages.mjs';
import { isPathSpecifier, resolveImportPathSpecifier, resolvePathSpecifier } from './path-resolution.mjs';

export async function resolveSpecifier(importer, specifier, options) {
  const report = createReport(path.resolve(importer), specifier, options);
  let resolvedReport;

  if (isBuiltinSpecifier(specifier)) {
    resolvedReport = resolveBuiltin(report);
    return applyInteropWarnings(withImportUrl(resolvedReport));
  }

  if (isPathSpecifier(specifier)) {
    resolvedReport = options.mode === 'import'
      ? await resolveImportPathSpecifier(report)
      : await resolvePathSpecifier(report);
    return applyInteropWarnings(withImportUrl(resolvedReport));
  }

  resolvedReport = await resolvePackageSpecifier(report);
  return applyInteropWarnings(withImportUrl(resolvedReport));
}

function withImportUrl(report) {
  if (report.mode !== 'import' || report.status !== 'resolved') {
    return report;
  }

  if (report.branch === 'builtin') {
    report.resolvedUrl = report.canonicalTarget;
    report.resolved = report.canonicalTarget;
    return report;
  }

  if (path.isAbsolute(report.resolvedPath)) {
    report.resolvedUrl = pathToFileURL(report.resolvedPath).href;
    report.resolved = report.resolvedUrl;
  }

  return report;
}
