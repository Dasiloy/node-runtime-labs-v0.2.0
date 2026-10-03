import path from 'node:path';
import { createReport, addError } from './trace.mjs';
import { isPathSpecifier, resolvePathSpecifier } from './path-resolution.mjs';

export async function resolveSpecifier(importer, specifier, options) {
  const report = createReport(path.resolve(importer), specifier, options);

  if (isPathSpecifier(specifier)) {
    return resolvePathSpecifier(report);
  }

  addError(report, {
    code: 'unsupported-specifier',
    specifier,
    message: `Resolution for ${specifier} is pending until later phases`,
  });
  return report;
}
