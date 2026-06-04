import { createServer } from "http";
import { createApp } from "./server/app.js";
import { attachWebSocket } from "./ws/broadcaster.js";

export const DEFAULT_PORT = 3747;

export interface HubServer {
  port: number;
  url: string;
  stop: () => Promise<void>;
}

export async function startHub(port = DEFAULT_PORT): Promise<HubServer> {
  const app = createApp();
  const server = createServer(app);
  attachWebSocket(server);

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const url = `http://localhost:${port}`;

  return {
    port,
    url,
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}

export { createApp } from "./server/app.js";
export { attachWebSocket, broadcast } from "./ws/broadcaster.js";
