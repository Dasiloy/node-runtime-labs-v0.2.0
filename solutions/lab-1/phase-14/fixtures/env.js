console.log("FLIGHT_RECORDER_DEMO:", process.env.FLIGHT_RECORDER_DEMO ?? "");
console.log("NODE_OPTIONS:", process.env.NODE_OPTIONS ?? "");
console.log("execArgv:", JSON.stringify(process.execArgv));
console.log("argv:", JSON.stringify(process.argv.slice(2)));
