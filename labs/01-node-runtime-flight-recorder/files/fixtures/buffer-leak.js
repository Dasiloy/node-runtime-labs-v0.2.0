const retained = [];
let count = 0;

const timer = setInterval(() => {
  count += 1;
  retained.push(Buffer.alloc(4 * 1024 * 1024, count));
  console.log(`retained ${retained.length} buffers`);
  if (count === 8) clearInterval(timer);
}, 100);
