console.log("stdout: boot");
console.error("stderr: boot warning");

let count = 0;
const timer = setInterval(() => {
  count += 1;
  process.stdout.write(`stdout: tick ${count}\n`);
  process.stderr.write(`stderr: tick ${count}\n`);
  if (count === 3) clearInterval(timer);
}, 80);
