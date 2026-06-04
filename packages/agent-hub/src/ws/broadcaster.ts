import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

export interface HubEvent {
  type: "agent:indexed" | "agent:updated" | "hub:status";
  payload: unknown;
  ts: number;
}

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    ws.send(
      JSON.stringify({
        type: "hub:status",
        payload: { message: "Connected to Clawd Agent Hub" },
        ts: Date.now(),
      })
    );
  });

  return wss;
}

export function broadcast(wss: WebSocketServer, event: HubEvent): void {
  const msg = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}
