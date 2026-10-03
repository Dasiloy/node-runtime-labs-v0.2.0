export async function runMetricsCommand(args) {
  if (args.includes("--help")) {
    console.log(`Usage: node src/cli.js metrics [options]

Options:
  --host <host>  Metrics host (default: 127.0.0.1)
  --port <port>  Metrics port (default: 9090)`);
    return;
  }

  const host = readFlag(args, "--host", "127.0.0.1");
  const port = readFlag(args, "--port", "9090");
  const response = await fetch(`http://${host}:${port}/metrics`);
  if (!response.ok) {
    throw new Error(`metrics request failed with HTTP ${response.status}`);
  }

  console.log(JSON.stringify(await response.json(), null, 2));
}

function readFlag(args, flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return fallback;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}
