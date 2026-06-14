import SvmA2AAgent from "./agent";
import { Hono } from "hono";
import { agentsMiddleware } from "hono-agents";
import auth from "../auth/caap";

const app = new Hono();

// Enable Cloudflare Agents routing + WebSocket support
app.use("*", agentsMiddleware());

// Auth routes (Clawd CAAP)
app.route("/auth", auth);

// Public discovery endpoint (SVM-A2A Agent Card)
app.get("/.well-known/agent-card.json", (c) => {
  return c.json({
    name: "SVM-A2A Production Agent",
    description: "Full-featured Solana Agent with Metaplex Core NFT Card",
    serviceEndpoint: "https://api.svm-a2a.ai",
    capabilities: ["streaming", "pushNotifications", "a2a"],
    authentication: ["SIWS", "NFT-Ownership", "CLAWD-Tier"],
    skills: ["research", "trading", "ui-generation", "mcp"],
    version: "1.0.0",
  });
});

export { SvmA2AAgent };
export default app;
