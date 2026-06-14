import { createServer } from "node:http";
import app from "../apps/api/src/index.js";

const port = Number(process.env.PORT ?? 8787);

const server = createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const host = incoming.headers.host ?? `localhost:${port}`;
  const request = new Request(`http://${host}${incoming.url ?? "/"}`, {
    method: incoming.method,
    headers: incoming.headers as HeadersInit,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined
  });

  const response = await app.fetch(request);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (response.body) {
    const body = Buffer.from(await response.arrayBuffer());
    outgoing.end(body);
  } else {
    outgoing.end();
  }
});

server.listen(port, () => {
  console.log(`SVM-A2A dev server listening on http://localhost:${port}`);
});
