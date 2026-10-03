export function printHelp(stream = process.stdout) {
  stream.write(`Atomic File Watcher + Incremental Build Cache

Usage:
  npm run scan -- [directory] [flags]
  npm run watch -- [directory] [flags]

Commands:
  scan             scan the watched directory once
  watch            start watch mode

Flags:
  --help                 show this help
  --metadata             include stat metadata
  --hash                 include SHA-256 content hashes
  --poll                 use fs.watchFile polling
  --poll-interval <ms>   polling interval in milliseconds
  --debounce <ms>        debounce rebuild batches
  --concurrency <n>      rebuild concurrency limit
  --rebuild-delay-ms <n> delay placeholder rebuild work
  --follow-symlinks      follow symlink targets
  --cache <path>         cache file path
  --no-cache             disable cache loading and saving
`);
}
