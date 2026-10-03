import fs from 'node:fs/promises';
import path from 'node:path';
import { addWarning } from './trace.mjs';

async function readSourceIfFile(filePath) {
  if (!filePath || !path.isAbsolute(filePath)) {
    return '';
  }

  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function hasDirectCjsExport(source, importedName) {
  const escapedName = importedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const propertyAssignment = new RegExp(`exports\\.${escapedName}\\s*=`);
  const objectExport = new RegExp(`module\\.exports\\s*=\\s*\\{[^}]*\\b${escapedName}\\b`, 's');
  return propertyAssignment.test(source) || objectExport.test(source);
}

function hasRuntimeBuiltExports(source) {
  return /exports\s*\[/.test(source) || /module\.exports\s*\[/.test(source);
}

export async function applyInteropWarnings(report) {
  if (report.status !== 'resolved') {
    return report;
  }

  if (report.consumerFormat === 'esm' && report.importedName && report.moduleFormat === 'cjs') {
    const source = await readSourceIfFile(report.resolvedPath);
    if (!hasDirectCjsExport(source, report.importedName) || hasRuntimeBuiltExports(source)) {
      addWarning(report, {
        type: 'named-import-from-cjs-runtime-export',
        evidence: {
          importedName: report.importedName,
          resolvedPath: report.resolvedPath,
          moduleFormat: report.moduleFormat,
          runtimeBuiltExports: hasRuntimeBuiltExports(source),
        },
        suggestion: 'Use a default or namespace import, or expose statically analyzable CommonJS named exports.',
      });
    }
  }

  if (report.consumerFormat === 'cjs' && report.moduleFormat === 'esm') {
    addWarning(report, {
      type: 'require-esm-namespace',
      evidence: {
        resolvedPath: report.resolvedPath,
        packageType: report.packageType,
        moduleFormat: report.moduleFormat,
      },
      suggestion: 'Treat the return value as an ESM namespace and check whether the target uses top-level await.',
    });
  }

  return report;
}
