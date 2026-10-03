import process from 'node:process';
import { resolveSpecifier } from './resolver/index.mjs';
import { renderResolutionText } from './reports/text.mjs';

const usage = `Usage:
  resolve <importer> <specifier> [flags]

Positional arguments:
  importer                 File that requests the module
  specifier                Module specifier to resolve

Flags:
  --mode <require|import>  Resolver mode (default: require)
  --conditions <name>      Add an active export condition, repeatable
  --format <text|json>     Output format (default: text)
  --compare-modes          Resolve once as require and once as import
  --preserve-symlinks      Preserve symlink spelling in identity fields
  --help                   Show this help
`;

const optionDefaults = {
  mode: 'require',
  conditions: [],
  format: 'text',
  preserveSymlinks: false,
  compareModes: false,
};

function argumentError(message) {
  console.error(message);
  process.exitCode = 2;
}

function parseResolveArgs(args) {
  const options = {
    ...optionDefaults,
    conditions: [],
  };
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help') {
      return { help: true, options, positionals };
    }

    if (arg === '--preserve-symlinks') {
      options.preserveSymlinks = true;
      continue;
    }

    if (arg === '--compare-modes') {
      options.compareModes = true;
      continue;
    }

    if (arg === '--mode') {
      const value = args[++index];
      if (value !== 'require' && value !== 'import') {
        throw new Error('--mode expects "require" or "import"');
      }
      options.mode = value;
      continue;
    }

    if (arg === '--conditions') {
      const value = args[++index];
      if (!value || value.startsWith('--')) {
        throw new Error('--conditions expects a condition name');
      }
      options.conditions.push(value);
      continue;
    }

    if (arg === '--format') {
      const value = args[++index];
      if (value !== 'text' && value !== 'json') {
        throw new Error('--format expects "text" or "json"');
      }
      options.format = value;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    positionals.push(arg);
  }

  return { help: false, options, positionals };
}

async function runResolve(rawArgs) {
  let parsed;
  try {
    parsed = parseResolveArgs(rawArgs);
  } catch (error) {
    argumentError(error.message);
    return;
  }

  if (parsed.help) {
    console.log(usage);
    return;
  }

  const [importer, specifier, ...extra] = parsed.positionals;
  if (!importer || !specifier || extra.length > 0) {
    argumentError('resolve expects exactly: resolve <importer> <specifier>');
    return;
  }

  if (parsed.options.compareModes) {
    const requireReport = await resolveSpecifier(importer, specifier, {
      ...parsed.options,
      mode: 'require',
      compareModes: false,
    });
    const importReport = await resolveSpecifier(importer, specifier, {
      ...parsed.options,
      mode: 'import',
      compareModes: false,
    });
    const comparison = compareModeReports(requireReport, importReport);

    if (parsed.options.format === 'json') {
      console.log(JSON.stringify(comparison, null, 2));
    } else {
      console.log(renderModeComparisonText(comparison));
    }

    if (requireReport.status === 'failed' || importReport.status === 'failed') {
      process.exitCode = 1;
    }
    return;
  }

  const report = await resolveSpecifier(importer, specifier, parsed.options);
  if (parsed.options.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
    if (report.status === 'failed') {
      process.exitCode = 1;
    }
    return;
  }

  console.log(renderResolutionText(report));
  if (report.status === 'failed') {
    process.exitCode = 1;
  }
}

function compareModeReports(requireReport, importReport) {
  const differences = [];

  if (requireReport.errors.some((error) => error.code === 'extension-required') || importReport.errors.some((error) => error.code === 'extension-required')) {
    differences.push('extension-required');
  }

  if (requireReport.errors.some((error) => error.code === 'directory-import-unsupported') || importReport.errors.some((error) => error.code === 'directory-import-unsupported')) {
    differences.push('directory-import-unsupported');
  }

  const requireConditionPath = requireReport.matchedExport?.conditionPath?.join('>') ?? '';
  const importConditionPath = importReport.matchedExport?.conditionPath?.join('>') ?? '';
  if (requireConditionPath !== importConditionPath) {
    differences.push('condition-branch-differs');
  }

  if (requireReport.moduleFormat && importReport.moduleFormat && requireReport.moduleFormat !== importReport.moduleFormat) {
    differences.push('format-differs');
  }

  if (requireReport.resolvedPath && importReport.resolvedPath && requireReport.resolvedPath !== importReport.resolvedPath) {
    differences.push('target-differs');
  }

  return {
    specifier: requireReport.specifier,
    importer: requireReport.importer,
    require: requireReport,
    import: importReport,
    differences: [...new Set(differences)],
  };
}

function modeTarget(report) {
  return report.resolvedUrl ?? report.resolvedPath ?? '(failed)';
}

function renderModeComparisonText(comparison) {
  return [
    `Compare modes for ${comparison.specifier}`,
    `Require: ${modeTarget(comparison.require)} (${comparison.require.moduleFormat ?? comparison.require.status})`,
    `Import:  ${modeTarget(comparison.import)} (${comparison.import.moduleFormat ?? comparison.import.status})`,
    `Differences: ${comparison.differences.length === 0 ? '(none)' : comparison.differences.join(', ')}`,
  ].join('\n');
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === 'resolve') {
    await runResolve(args);
    return;
  }

  if (command === 'cache' || command === 'inspect-package') {
    console.log(`${command} command pending`);
    return;
  }

  if (command === '--help' || command === undefined) {
    console.log(usage);
    return;
  }

  argumentError(`Unknown command: ${command}`);
}

await main();
