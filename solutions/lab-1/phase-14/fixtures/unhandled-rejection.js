setTimeout(() => {
  Promise.reject(new Error("database write promise was lost"));
}, 50);

setTimeout(() => {
  console.log("this line should only appear if the process kept running");
}, 500);
