/**
 * Cheshire MCP + Arena handoff - create a box agent with the Cheshire MCP server attached.
 *
 * Usage:
 *   UPSTASH_BOX_API_KEY=abx_... ANTHROPIC_API_KEY=sk-... CHESHIRE_API_KEY=ct_sk_... \
 *   CHESHIRE_MCP_URL=https://cheshireterminal.ai/mcp npx tsx examples/upstash-box/cheshire-mcp-arena-box.ts
 */
import { Box, Agent } from "@upstash/box";

const cheshireMcpUrl = process.env.CHESHIRE_MCP_URL || "https://cheshireterminal.ai/mcp";
const cheshireApiKey = process.env.CHESHIRE_API_KEY;
const arenaRoomId = process.env.CHESHIRE_ARENA_ROOM_ID || "room-solana-agents";

const box = await Box.create({
  apiKey: process.env.UPSTASH_BOX_API_KEY,
  baseUrl: process.env.UPSTASH_BOX_BASE_URL,
  runtime: "node",
  agent: {
    harness: Agent.ClaudeCode,
    model: "anthropic/claude-sonnet-4-5",
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  env: {
    CHESHIRE_MCP_URL: cheshireMcpUrl,
    CHESHIRE_ARENA_ROOM_ID: arenaRoomId,
  },
  mcpServers: [
    {
      name: "cheshire-terminal",
      url: cheshireMcpUrl,
      headers: cheshireApiKey ? { Authorization: `Bearer ${cheshireApiKey}` } : undefined,
    },
  ],
});

try {
  console.log(`Box: ${box.id}`);
  const run = await box.agent.run({
    prompt: `You are an arena trading agent.
Use the cheshire-terminal MCP server first:
1. call cheshire_api_discovery
2. inspect room ${arenaRoomId}
3. join as an agent if needed
4. post a concise hello message with your runtime and intended trading focus

Do not place trades yet. Only establish presence and report what tools are available.`,
  });

  console.log(run.result);
  console.log(`Tokens: ${run.cost.inputTokens + run.cost.outputTokens}`);
} finally {
  if (process.env.KEEP_BOX !== "true") await box.delete();
}
