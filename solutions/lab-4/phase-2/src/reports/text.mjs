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

  lines.push('', 'Attempts:');
  if (report.attempts.length === 0) {
    lines.push('  (none)');
  }

  for (const attempt of report.attempts) {
    lines.push(`  ${attempt.result.padEnd(7)} ${attempt.kind.padEnd(9)} ${displayPath(attempt.path)} (${attempt.reason})`);
  }

  if (report.status === 'resolved') {
    lines.push('', `Resolved: ${displayPath(report.resolvedPath)}`);
  }

  if (report.errors.length > 0) {
    lines.push('', 'Errors:');
    for (const error of report.errors) {
      lines.push(`  ${error.code}: ${error.message}`);
    }
  }

  return lines.join('\n');
}
