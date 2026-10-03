const commands = new Set([
  "put",
  "get",
  "scan",
  "delete",
  "inspect",
  "inspect-format",
  "encode",
  "decode",
  "recover",
  "compact",
  "bench",
]);

const usage = `Usage:
  npm run db -- --help
  npm run put -- <key> <value>
  npm run get -- <key>
  npm run scan
  npm run delete -- <key>
  npm run inspect -- --offset <byte-offset>

Default paths:
  segment: data/segment-0001.dat
  index:   data/index.json
  reports: reports/

Commands:
  put             Append a key/value record
  get             Read the latest value for a key
  scan            Print records in segment order
  delete          Append a delete tombstone
  inspect         Decode one record at an offset
  inspect-format  Print the record format
  encode          Encode one record and print bytes
  decode          Decode bytes into one record
  recover         Truncate a damaged segment tail
  compact         Rewrite live records into a compact segment
  bench           Run storage benchmarks`;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function notImplemented(command) {
  fail(`${command} is not implemented yet`);
}

function main(argv = process.argv.slice(2)) {
  const [command] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }

  if (!commands.has(command)) {
    fail(`Unknown command: ${command}\nRun "npm run db -- --help" for usage.`);
    return;
  }

  switch (command) {
    case "put":
    case "get":
    case "scan":
    case "inspect":
    case "delete":
    case "inspect-format":
    case "encode":
    case "decode":
    case "recover":
    case "compact":
    case "bench":
      notImplemented(command);
      break;
  }
}

main();
