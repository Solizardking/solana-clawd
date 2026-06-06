/**
 * OpenClawd Ecosystem — runtime bindings for everything Clawd has learned.
 *
 * This module is the leviathan's institutional memory made executable.
 * Import it anywhere in the runtime to get live access to the full stack.
 */

import { Connection } from "@solana/web3.js";
import { DEFAULT_RPC, CLAWD_MINT } from "../config.js";

// ─── Lazy-load workspace packages ────────────────────────────────────────────
// These are workspace:* packages — available after `pnpm install`.
// We lazy-load to avoid forcing all services to boot on startup.

export async function getAgentIndex() {
  const { AgentIndex } = await import("@openclawdsolana/agent-registry");
  return new AgentIndex();
}

export async function getSolanaAiInferenceClient(walletOrKeypair: unknown) {
  const { SolanaAiInferenceClient } = await import("@clawd/solana-ai-inference-client");
  const connection = new Connection(DEFAULT_RPC, "confirmed");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new SolanaAiInferenceClient(connection, walletOrKeypair as any);
}

export async function getOreMinerClient() {
  const { OreMinerClient } = await import("@clawd/solana-ai-inference-client");
  return new OreMinerClient();
}

export async function getSwapService(chain: "mainnet" | "devnet" = "mainnet") {
  const { SwapService } = await import("@openclawd/wallet");
  return new SwapService({ chain });
}

export async function getX402Client() {
  const { createClawdX402Client } = await import("@openclawd/agents-x402") as { createClawdX402Client?: () => unknown };
  if (!createClawdX402Client) throw new Error("agents-x402: createClawdX402Client not found");
  return createClawdX402Client();
}

// ─── Constants re-exported for convenience ────────────────────────────────────

export { CLAWD_MINT };

export const AI_INFERENCE_PROGRAM_ID = "Bg96xPuC3Mt2xnEnQPQBJY8QBqD6J7hn3WgnqDK43pKT";

export const ECOSYSTEM_REGISTRY = {
  packages: {
    sdk:          "@openclawdsolana/solana-sdk",
    registry:     "@openclawdsolana/agent-registry",
    hub:          "@openclawdsolana/agent-hub",
    wallet:       "@openclawd/wallet",
    vault:        "agentwallet-vault",
    x402:         "@openclawd/agents-x402",
    percolator:   "@openclawd/percolator",
    standalone:   "@openclawdsolana/clawd-standalone",
    inference:    "@clawd/solana-ai-inference-client",
  },
  programs: {
    aiInference:  "Bg96xPuC3Mt2xnEnQPQBJY8QBqD6J7hn3WgnqDK43pKT",
    clawdProtocol: "CLAWDprotoco1111111111111111111111111111111",
  },
  sites: {
    main:    "https://x402.wtf",
    agents:  "https://x402.wtf/agents",
    gateway: "https://x402.wtf/gateway",
    x402:    "https://x402.wtf",
    hub:     "http://localhost:3747",
  },
  caap: {
    version:    "1.0",
    wellKnown:  "/.well-known/agent-auth",
    authMethod: "Ed25519 + JWT + SIWS",
  },
} as const;

// ─── Quick health check ───────────────────────────────────────────────────────

export async function ecosystemHealthCheck(): Promise<{
  ok: boolean;
  results: Array<{ name: string; status: "ok" | "fail"; error?: string }>;
}> {
  const checks: Array<{ name: string; fn: () => Promise<void> }> = [
    {
      name: "clawd-sdk",
      fn: async () => {
        const { CLAWD_MINT_MAINNET } = await import("@openclawdsolana/solana-sdk");
        if (!CLAWD_MINT_MAINNET) throw new Error("missing CLAWD_MINT_MAINNET");
      },
    },
    {
      name: "agent-registry",
      fn: async () => {
        const { AgentIndex } = await import("@openclawdsolana/agent-registry");
        const idx = new AgentIndex();
        if (!idx) throw new Error("AgentIndex failed to construct");
      },
    },
    {
      name: "ai-inference-client",
      fn: async () => {
        const { AI_INFERENCE_PROGRAM_ID } = await import("@clawd/solana-ai-inference-client");
        if (!AI_INFERENCE_PROGRAM_ID) throw new Error("missing program ID");
      },
    },
    {
      name: "clawd-wallet",
      fn: async () => {
        const { SOLANA_TOKENS } = await import("@openclawd/wallet");
        if (!SOLANA_TOKENS.SOL) throw new Error("SOLANA_TOKENS.SOL missing");
      },
    },
    {
      name: "agentwallet-vault",
      fn: async () => {
        const m = await import("agentwallet-vault");
        if (typeof m.Vault !== "function") throw new Error("Vault not a class");
      },
    },
  ];

  const results = await Promise.all(
    checks.map(async ({ name, fn }) => {
      try {
        await fn();
        return { name, status: "ok" as const };
      } catch (e) {
        return { name, status: "fail" as const, error: (e as Error).message };
      }
    })
  );

  return { ok: results.every((r) => r.status === "ok"), results };
}
