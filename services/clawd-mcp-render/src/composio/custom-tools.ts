import { experimental_createTool } from "@composio/core";
import { z } from "zod/v3";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runVulcanJson(args: string[]): Promise<Record<string, unknown>> {
  const { stdout, stderr } = await execFileAsync("vulcan", [...args, "-o", "json"], {
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,
  });
  const text = stdout.trim();
  if (!text) return { ok: false, stderr: stderr.trim() };
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? parsed as Record<string, unknown>
      : { ok: true, data: parsed };
  } catch {
    return { ok: true, stdout: text, stderr: stderr.trim() };
  }
}

export const clawdRuntimeStatusTool = experimental_createTool("CLAWD_RUNTIME_STATUS", {
  name: "Clawd runtime status",
  description: "Report the sovereign Clawd runtime identity, model endpoint, Solana user, and MCP integration mode.",
  preload: true,
  inputParams: z.object({}),
  execute: async (_input, ctx) => ({
    runtime: "clawd-sovereign",
    userId: ctx.userId,
    model: process.env.CLAWD_MODEL ?? "unset",
    modelBaseUrl: process.env.CLAWD_MODEL_BASE_URL ?? "unset",
    composioUserId: process.env.COMPOSIO_USER_ID ?? "unset",
    solanaMcp: process.env.SOLANA_CLAWD_MCP_URL ?? "http://localhost:3001",
    vulcanAvailable: await execFileAsync("vulcan", ["version"], { timeout: 10_000 })
      .then(({ stdout }) => stdout.trim())
      .catch(() => false),
  }),
});

export const vulcanStatusTool = experimental_createTool("CLAWD_VULCAN_STATUS", {
  name: "Vulcan Phoenix status",
  description: "Read-only Vulcan/Phoenix account, wallet, market, and connectivity status in JSON mode.",
  preload: true,
  inputParams: z.object({}),
  execute: async () => runVulcanJson(["status"]),
});

export const vulcanMarketTool = experimental_createTool("CLAWD_VULCAN_MARKET", {
  name: "Vulcan Phoenix market",
  description: "Read-only Phoenix perpetuals market data through Vulcan. Does not place orders.",
  preload: true,
  inputParams: z.object({
    symbol: z.string().describe("Phoenix perps market symbol, for example SOL-PERP"),
    command: z.enum(["ticker", "orderbook", "funding"]).default("ticker"),
  }),
  execute: async (input) => runVulcanJson(["market", input.command, input.symbol]),
});

export function getClawdCustomTools() {
  return [clawdRuntimeStatusTool, vulcanStatusTool, vulcanMarketTool];
}
