setTimeout(() => {
  throw new Error("synchronous crash from timer");
}, 50);
