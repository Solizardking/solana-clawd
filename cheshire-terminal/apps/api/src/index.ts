import { Hono } from "hono";
import { auth } from "../../packages/auth/src/caap";

const app = new Hono();

app.get("/", (c) => c.text("✅ SVM-A2A API is running"));

// Auth + Discovery
app.route("/auth", auth);
app.get("/discover", (c) =>
  c.json({
    agents: ["MySVM-A2AAgent"],
    providers: ["plexpert.ai", "myagent.ai"],
    status: "healthy",
  }),
);

export default app;
