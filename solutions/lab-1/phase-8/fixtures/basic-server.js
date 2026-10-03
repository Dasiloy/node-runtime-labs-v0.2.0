import http from "node:http";

const server = http.createServer((req, res) => {
  res.end("ok\n");
});

server.listen(0, () => {
  const { port } = server.address();
  console.log(`server listening on ${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => {
    console.error(`server closed after ${signal}`);
  }));
}
