import http from "node:http";

const server = http.createServer((req, res) => {
  res.end("still here\n");
});

server.listen(0, () => {
  const { port } = server.address();
  console.log(`hanging server listening on ${port}`);
});
