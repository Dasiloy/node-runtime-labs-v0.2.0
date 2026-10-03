const fieldTypes = new Map([
  ['id', 'number'],
  ['status', 'number'],
  ['ts', 'string'],
  ['method', 'string'],
  ['path', 'string'],
  ['ip', 'string'],
  ['userAgent', 'string'],
  ['payload', 'string'],
]);

const symbolOperators = new Set(['>=', '<=', '!=', '=', '<', '>']);

function cleanValue(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseFilter(expression) {
  const containsMatch = expression.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s+contains\s+(.+?)\s*$/);
  const symbolMatch = expression.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*(>=|<=|!=|=|<|>)\s*(.+?)\s*$/);
  const match = containsMatch
    ? [containsMatch[0], containsMatch[1], 'contains', containsMatch[2]]
    : symbolMatch;

  if (!match) {
    throw new Error(`Invalid filter expression: ${expression}`);
  }

  const [, field, operator, rawValue] = match;

  if (!fieldTypes.has(field)) {
    throw new Error(`Unknown filter field: ${field}`);
  }

  if (operator !== 'contains' && !symbolOperators.has(operator)) {
    throw new Error(`Invalid filter operator: ${operator}`);
  }

  const fieldType = fieldTypes.get(field);
  const cleanedValue = cleanValue(rawValue);

  if (fieldType === 'number') {
    const value = Number(cleanedValue);
    if (!Number.isFinite(value)) {
      throw new Error(`Filter value for ${field} must be numeric`);
    }

    return {
      field,
      operator,
      value,
      valueType: 'number',
    };
  }

  if (!['=', '!=', 'contains'].includes(operator)) {
    throw new Error(`Operator ${operator} is invalid for string field ${field}`);
  }

  return {
    field,
    operator,
    value: cleanedValue,
    valueType: 'string',
  };
}

export function compileFilter(expression) {
  const filter = parseFilter(expression);

  return (row) => {
    const actual = row[filter.field];

    switch (filter.operator) {
      case '>=':
        return actual >= filter.value;
      case '<=':
        return actual <= filter.value;
      case '>':
        return actual > filter.value;
      case '<':
        return actual < filter.value;
      case '=':
        return actual === filter.value;
      case '!=':
        return actual !== filter.value;
      case 'contains':
        return String(actual ?? '').includes(filter.value);
      default:
        throw new Error(`Unsupported filter operator: ${filter.operator}`);
    }
  };
}
