import SvmA2AAgent from "./agent.js";
import { auth } from "../../auth/src/index.js";
import { buildSvmA2AAgentCard } from "./agent-card.js";
import { json, SvmRouter } from "./router.js";
import type { SvmA2ATaskInput } from "./types.js";

const app = new SvmRouter();
const agent = new SvmA2AAgent();

app.route("/auth", auth);

app.get("/", () => new Response("SVM-A2A runtime is running"));

app.get("/.well-known/agent-card.json", (request) => {
  const baseUrl = new URL(request.url).origin;
  return json(buildSvmA2AAgentCard(baseUrl));
});

app.get("/.well-known/agent.json", (request) => {
  const baseUrl = new URL(request.url).origin;
  return json(buildSvmA2AAgentCard(baseUrl));
});

app.get("/.well-known/did.json", (request) => {
  const baseUrl = new URL(request.url).origin;
  return json({
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: `${baseUrl}/.well-known/did.json`,
    service: [
      {
        id: "#svm-a2a",
        type: "AgentService",
        serviceEndpoint: `${baseUrl}/tasks`
      }
    ]
  });
});

app.get("/discover", (request) => {
  const baseUrl = new URL(request.url).origin;
  return json({
    agents: ["SVM-A2A Production Agent"],
    providers: ["plexpert.ai", "myagent.ai", "x402.wtf"],
    status: "healthy",
    agentCard: `${baseUrl}/.well-known/agent-card.json`
  });
});

app.get("/mcp/tools", () => {
  return json({
    tools: ["research", "trading", "ui-generation", "mcp"],
    protocol: "svm-a2a/0.1"
  });
});

app.post("/tasks", async (request) => {
  const input = await request.json() as SvmA2ATaskInput;
  const task = await agent.handleTask(input);
  return json(task);
});

app.get("/tasks/:id", (_request, params) => {
  return json({
    id: params.id,
    status: {
      state: "completed",
      message: {
        role: "agent",
        parts: [{ type: "text", text: "Task state is kept by the durable runtime in production." }]
      }
    }
  });
});

app.get("/tasks/:id/subscribe", (_request, params) => {
  const payload = JSON.stringify({
    state: "completed",
    message: {
      role: "agent",
      parts: [{ type: "text", text: `Task ${params.id} completed.` }]
    }
  });
  return new Response(`event: status\ndata: ${payload}\n\n`, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    }
  });
});

export { SvmA2AAgent, buildSvmA2AAgentCard };
export type * from "./types";
export default app;
