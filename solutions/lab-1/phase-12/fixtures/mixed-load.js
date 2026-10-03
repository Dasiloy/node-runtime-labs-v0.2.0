process.emitWarning("mixed-load warning", { code: "MIXED_LOAD" });
console.log("mixed load start");

const retained = [];
setTimeout(() => {
  retained.push(Buffer.alloc(8 * 1024 * 1024, 1));
  console.error("allocated external memory");
}, 100);

setTimeout(() => {
  const end = Date.now() + 500;
  while (Date.now() < end) Math.random();
  console.log("cpu spike finished");
}, 250);

setTimeout(() => {
  console.log(`retained buffers: ${retained.length}`);
}, 900);
