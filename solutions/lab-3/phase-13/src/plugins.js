const redactedValue = '[REDACTED]';
const knownEnrichments = new Set(['statusClass', 'payloadLength']);

function splitList(value) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function redact(fields) {
  return {
    name: 'redact',
    fields,
    apply(row) {
      const next = { ...row };

      for (const field of fields) {
        if (Object.hasOwn(next, field)) {
          next[field] = redactedValue;
        }
      }

      return next;
    },
  };
}

function enrich(fields) {
  for (const field of fields) {
    if (!knownEnrichments.has(field)) {
      throw new Error(`Unknown enrichment: ${field}`);
    }
  }

  return {
    name: 'enrich',
    fields,
    apply(row) {
      const next = { ...row };

      for (const field of fields) {
        if (field === 'statusClass') {
          next.statusClass = `${Math.floor(Number(next.status) / 100)}xx`;
        } else if (field === 'payloadLength') {
          next.payloadLength = Buffer.byteLength(String(next.payload ?? ''));
        }
      }

      return next;
    },
  };
}

function select(fields) {
  return {
    name: 'select',
    fields,
    apply(row) {
      const next = {};

      for (const field of fields) {
        if (Object.hasOwn(row, field)) {
          next[field] = row[field];
        }
      }

      return next;
    },
  };
}

export function parsePluginOptions(options) {
  return {
    redact: splitList(options.redact),
    select: splitList(options.select),
    enrich: splitList(options.enrich),
  };
}

export function buildPlugins(options) {
  const config = parsePluginOptions(options);
  const plugins = [];

  if (config.redact.length > 0) {
    plugins.push(redact(config.redact));
  }
  if (config.enrich.length > 0) {
    plugins.push(enrich(config.enrich));
  }
  if (config.select.length > 0) {
    plugins.push(select(config.select));
  }

  return {
    plugins,
    config,
    executionOrder: plugins.map((plugin) => plugin.name),
  };
}

export function applyPlugins(row, plugins) {
  let current = row;

  for (const plugin of plugins) {
    current = plugin.apply(current);
  }

  return current;
}

export function runPluginCompositionCheck() {
  const row = {
    id: 1,
    status: 503,
    ip: '10.0.0.1',
    payload: 'abcdef',
  };
  const { plugins } = buildPlugins({
    redact: 'ip',
    enrich: 'payloadLength',
    select: 'id,status,ip,payloadLength',
  });
  const output = applyPlugins(row, plugins);
  const keys = Object.keys(output);

  if (JSON.stringify(keys) !== JSON.stringify(['id', 'status', 'ip', 'payloadLength'])) {
    throw new Error(`Unexpected selected field order: ${keys.join(',')}`);
  }
  if (output.ip !== redactedValue) {
    throw new Error('Redaction did not run before selection');
  }
  if (output.payloadLength !== 6) {
    throw new Error('Enrichment did not run before selection');
  }

  return output;
}
