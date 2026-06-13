/**
 * nemoClawd MCP Server — HTTP transport entry point
 *
 * Used by `npm run start:http` and the Fly.io deployment.
 * Exposes the MCP server over Streamable HTTP on PORT (default 3000).
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { server } from "./index.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const MCP_API_KEY = process.env.MCP_API_KEY ?? "";

function unauthorized(res: ServerResponse): void {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized" }));
}

function healthCheck(res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", server: "nemoClawd MCP", version: "0.1.0" }));
}

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === "/healthz") {
    healthCheck(res);
    return;
  }

  if (MCP_API_KEY) {
    const auth = req.headers["authorization"] ?? "";
    if (auth !== `Bearer ${MCP_API_KEY}`) {
      unauthorized(res);
      return;
    }
  }

  await transport.handleRequest(req, res);
});

await server.connect(transport);

httpServer.listen(PORT, () => {
  console.error(`nemoClawd MCP Server running (http) on port ${PORT}`);
});
