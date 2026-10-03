import path from 'node:path';

function displayPath(filePath) {
  return path.relative(process.cwd(), filePath) || '.';
}

export function renderResolutionText(report) {
  const lines = [
    `Resolve ${report.specifier}`,
    `Importer: ${displayPath(report.importer)}`,
    `Mode: ${report.mode}`,
  ];

  if (report.metadata.length > 0) {
    lines.push('', 'Metadata:');
    for (const event of report.metadata) {
      const value = event.value === undefined ? '' : ` ${JSON.stringify(event.value)}`;
      lines.push(`  ${event.kind} ${event.result}${value} ${event.path ? displayPath(event.path) : ''}`.trimEnd());
    }
  }

  if (report.packageCandidates?.length > 0) {
    lines.push('', 'Package lookup:');
    for (const candidate of report.packageCandidates) {
      lines.push(`  ${candidate.result.padEnd(7)} ${displayPath(candidate.packagePath)}`);
    }
  }

  if (report.branch === 'builtin') {
    lines.push(
      '',
      `Built-in: ${report.originalSpecifier} -> ${report.canonicalTarget}`,
      'Filesystem probing skipped because the specifier matched Node built-in modules.',
      'node_modules search skipped because built-ins resolve before userland packages.',
    );
  }

  lines.push('', 'Attempts:');
  if (report.attempts.length === 0) {
    lines.push('  (none)');
  }

  for (const attempt of report.attempts) {
    lines.push(`  ${attempt.result.padEnd(7)} ${attempt.kind.padEnd(9)} ${displayPath(attempt.path)} (${attempt.reason})`);
  }

  if (report.status === 'resolved') {
    lines.push('', `Resolved: ${displayPath(report.resolvedPath)}`);
    if (report.moduleFormat) {
      lines.push(`Format: ${report.moduleFormat}`);
    }
    if (report.entryField) {
      lines.push(`Entry field: ${report.entryField}`);
    }
  }

  if (report.errors.length > 0) {
    lines.push('', 'Errors:');
    for (const error of report.errors) {
      lines.push(`  ${error.code}: ${error.message}`);
    }
  }

  return lines.join('\n');
}
