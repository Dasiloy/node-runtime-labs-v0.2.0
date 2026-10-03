import path from 'node:path';
import { createReport, addError } from './trace.mjs';
import { isBuiltinSpecifier, resolveBuiltin } from './builtins.mjs';
import { isPathSpecifier, resolvePathSpecifier } from './path-resolution.mjs';

export async function resolveSpecifier(importer, specifier, options) {
  const report = createReport(path.resolve(importer), specifier, options);

  if (isBuiltinSpecifier(specifier)) {
    return resolveBuiltin(report);
  }

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
