const copies = [];
const source = Buffer.alloc(12 * 1024 * 1024, 1);

for (let i = 0; i < 6; i += 1) {
  copies.push(Buffer.from(source));
}

console.log(`copies retained: ${copies.length}`);

// Keep retained buffers reachable long enough for interval sampling.
setTimeout(() => {
  void copies.length;
}, 350);
