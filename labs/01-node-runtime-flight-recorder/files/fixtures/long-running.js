let count = 0;
const timer = setInterval(() => {
  count += 1;
  console.log(`working ${count}`);
}, 500);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.error(`child received ${signal}`);
    clearInterval(timer);
    process.exitCode = signal === "SIGINT" ? 130 : 143;
  });
}
