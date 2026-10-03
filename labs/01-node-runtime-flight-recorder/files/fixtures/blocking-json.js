console.log("warming up");

setTimeout(() => {
  const rows = Array.from({ length: 250_000 }, (_, id) => ({ id, name: `row-${id}` }));
  const text = JSON.stringify(rows);
  JSON.parse(text);
  console.log("blocking json work finished");
}, 300);

setTimeout(() => {
  console.log("done");
}, 1_500);
