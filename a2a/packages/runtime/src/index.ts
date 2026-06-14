import { Hono } from "hono";
import SvmA2AAgent from "./agent";
import { auth } from "../../auth/src";
import { buildSvmA2AAgentCard } from "./agent-card";
import type { SvmA2ATaskInput } from "./types";

const app = new Hono();
const agent = new SvmA2AAgent();

app.route("/auth", auth);

app.get("/", (c) => c.text("SVM-A2A runtime is running"));

app.get("/.well-known/agent-card.json", (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json(buildSvmA2AAgentCard(baseUrl));
});

app.get("/.well-known/agent.json", (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json(buildSvmA2AAgentCard(baseUrl));
});

app.post("/tasks", async (c) => {
  const input = await c.req.json<SvmA2ATaskInput>();
  const task = await agent.handleTask(input);
  return c.json(task);
});

app.get("/tasks/:id", (c) => {
  return c.json({
    id: c.req.param("id"),
    status: {
      state: "completed",
      message: {
        role: "agent",
        parts: [{ type: "text", text: "Task state is kept by the durable runtime in production." }]
      }
    }
  });
});

export { SvmA2AAgent, buildSvmA2AAgentCard };
export type * from "./types";
export default app;
