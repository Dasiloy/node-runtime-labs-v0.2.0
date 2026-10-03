console.log("starting cpu loop");

const end = Date.now() + 1_200;
let value = 0;
while (Date.now() < end) {
  value = (value + Math.sqrt(value + 1)) % 1_000_000;
}

console.log(`cpu loop finished ${value.toFixed(2)}`);

setTimeout(() => {
  console.log("cpu loop observation window closed");
}, 300);
