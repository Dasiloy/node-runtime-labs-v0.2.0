function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function list(items, mapper) {
  if (items.length === 0) {
    return '<li>(none)</li>';
  }
  return items.map(mapper).join('');
}

export function renderHtmlReport(report) {
  const traces = report.traces.map((trace) => `
    <section>
      <h3>${escapeHtml(trace.id)}: <code>${escapeHtml(trace.specifier)}</code></h3>
      <p><b>Status:</b> ${escapeHtml(trace.status)} ${trace.moduleFormat ? `<b>Format:</b> ${escapeHtml(trace.moduleFormat)}` : ''}</p>
      <p><b>Importer:</b> <code>${escapeHtml(trace.importer)}</code></p>
      ${trace.resolvedPath ? `<p><b>Resolved:</b> <code>${escapeHtml(trace.resolvedPath)}</code></p>` : ''}
      <ul>
        ${list(trace.errors, (error) => `<li><b>${escapeHtml(error.code)}</b>: ${escapeHtml(error.message)}</li>`)}
        ${list(trace.warnings, (warning) => `<li><b>${escapeHtml(warning.type)}</b>: ${escapeHtml(warning.suggestion)}</li>`)}
      </ul>
    </section>
  `).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Module Inspector Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.45; color: #1f2937; }
    code { background: #f3f4f6; padding: 0.1rem 0.25rem; border-radius: 0; }
    section { border-top: 1px solid #d1d5db; padding-top: 1rem; margin-top: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(4, max-content); gap: 0.75rem 1.5rem; }
  </style>
</head>
<body>
  <h1>Module Inspector Report</h1>
  <section>
    <h2>Summary</h2>
    <div class="grid">
      <b>Traces</b><span>${escapeHtml(report.traces.length)}</span>
      <b>Resolved</b><span>${escapeHtml(report.summary.resolved)}</span>
      <b>Failed</b><span>${escapeHtml(report.summary.failed)}</span>
      <b>Warnings</b><span>${escapeHtml(report.warnings.length)}</span>
    </div>
  </section>
  <section>
    <h2>Traces</h2>
    ${traces}
  </section>
  <section>
    <h2>Graph</h2>
    <ul>${list(report.graph.edges, (edge) => `<li><code>${escapeHtml(edge.from)}</code> -> <code>${escapeHtml(edge.to)}</code></li>`)}</ul>
  </section>
  <section>
    <h2>Cycles</h2>
    <ul>${list(report.cycles, (cycle) => `<li>${cycle.path.map((item) => `<code>${escapeHtml(item)}</code>`).join(' -> ')}</li>`)}</ul>
  </section>
  <section>
    <h2>Symlinks</h2>
    <ul>${list(report.symlinks, (note) => `<li><b>${escapeHtml(note.type)}</b> ${note.resolvedPath ? `<code>${escapeHtml(note.resolvedPath)}</code> -> <code>${escapeHtml(note.realPath)}</code>` : ''}</li>`)}</ul>
  </section>
</body>
</html>
`;
}
