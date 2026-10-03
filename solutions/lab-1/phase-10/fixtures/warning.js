process.emitWarning("cache size limit near threshold", {
  code: "FLIGHT_RECORDER_WARNING",
  detail: "warning fixture emitted deliberately",
});

setTimeout(() => {
  console.log("warning fixture completed");
}, 50);
