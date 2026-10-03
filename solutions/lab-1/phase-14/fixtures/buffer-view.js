const views = [];
const source = Buffer.alloc(12 * 1024 * 1024, 1);

for (let i = 0; i < 6; i += 1) {
  views.push(source.subarray(0));
}

console.log(`views retained: ${views.length}`);

// Keep retained views reachable long enough for interval sampling.
setTimeout(() => {
  void views.length;
}, 350);
