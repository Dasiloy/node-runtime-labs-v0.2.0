const scripts = [
  ['workbench', 'print this overview'],
  ['generate', 'create data/access.ndjson'],
  ['naive', 'run the whole-file processor'],
  ['stream', 'run the streaming processor'],
  ['split-check', 'verify line splitting with tiny chunks'],
  ['pressure', 'run the slow-sink pressure test'],
  ['compare', 'write the final comparison report'],
];

const defaultPaths = [
  'data/access.ndjson',
  'out/stream.ndjson',
  'reports/*.json',
];

function printHelp() {
  console.log(`Stream Processing Workbench

Commands:
${scripts.map(([name, description]) => `  npm run ${name.padEnd(11)} ${description}`).join('\n')}

Default paths:
${defaultPaths.map((path) => `  ${path}`).join('\n')}

Common flags:
  --input <path>
  --output <path>
  --where "status >= 500"
  --read-hwm <bytes>
  --help`);
}

const args = process.argv.slice(2);
const allowedFlags = new Set(['--help']);

for (const arg of args) {
  if (arg.startsWith('-') && !allowedFlags.has(arg)) {
    console.error(`Unknown flag: ${arg}`);
    process.exitCode = 1;
    process.exit();
  }
}

printHelp();
