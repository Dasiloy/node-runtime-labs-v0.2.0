import path from 'node:path';

function rel(filePath) {
  if (!filePath) {
    return '';
  }
  return path.isAbsolute(filePath) ? path.relative(process.cwd(), filePath) : filePath;
}

function lineList(items, mapper) {
  return items.length === 0 ? ['- (none)'] : items.map(mapper);
}

export function renderMarkdownReport(report) {
  const lines = [
    '# Module Inspector Report',
    '',
    '## Summary',
    '',
    `- Traces: ${report.traces.length}`,
    `- Resolved: ${report.summary.resolved}`,
    `- Failed: ${report.summary.failed}`,
    `- Warnings: ${report.warnings.length}`,
    `- Errors: ${report.errors.length}`,
    '',
    '## Traces',
    '',
  ];

  for (const trace of report.traces) {
    lines.push(`### ${trace.id}: \`${trace.specifier}\``);
    lines.push('');
    lines.push(`- Importer: \`${rel(trace.importer)}\``);
    lines.push(`- Status: \`${trace.status}\``);
    if (trace.resolvedPath) {
      lines.push(`- Resolved: \`${rel(trace.resolvedPath)}\``);
    }
    if (trace.moduleFormat) {
      lines.push(`- Format: \`${trace.moduleFormat}\``);
    }
    if (trace.matchedExport) {
      lines.push(`- Export: \`${trace.matchedExport.key}\` -> \`${trace.matchedExport.target}\``);
    }
    if (trace.errors.length > 0) {
      lines.push('- Errors:');
      for (const error of trace.errors) {
        lines.push(`  - \`${error.code}\`: ${error.message}`);
      }
    }
    if (trace.warnings.length > 0) {
      lines.push('- Warnings:');
      for (const warning of trace.warnings) {
        lines.push(`  - \`${warning.type}\`: ${warning.suggestion}`);
      }
    }
    lines.push('');
  }

  lines.push('## Graph Edges', '');
  lines.push(...lineList(report.graph.edges, (edge) => `- \`${rel(edge.from)}\` -> \`${rel(edge.to)}\``));
  lines.push('', '## Cycles', '');
  lines.push(...lineList(report.cycles, (cycle) => `- ${cycle.path.map((filePath) => `\`${rel(filePath)}\``).join(' -> ')}`));
  lines.push('', '## Symlinks', '');
  lines.push(...lineList(report.symlinks, (note) => `- \`${note.type}\`: ${note.resolvedPath ? `\`${rel(note.resolvedPath)}\` -> \`${rel(note.realPath)}\`` : ''}`));
  lines.push('', '## Timeline', '');
  lines.push(...lineList(report.timeline, (event) => `- \`${event.traceId ?? 'runtime'}\` ${event.type}: ${event.detail}`));

  return `${lines.join('\n')}\n`;
}
