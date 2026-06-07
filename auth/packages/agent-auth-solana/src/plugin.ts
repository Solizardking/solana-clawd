// CAAP Better Auth plugin — wraps SIWS from better-auth-solana and adds
// attestation endpoints for the Clawd Agent Attestation Protocol.

import type { AgentAuthSolanaConfig } from "./types";
import { attestAgent, fetchWalletSnapshot } from "./attestation";
import { computeTier } from "./subscription";

const DEFAULT_CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

// BetterAuthPlugin shape — minimal interface so this package doesn't hard-depend
// on the full better-auth bundle at runtime.
export interface MinimalPlugin {
  id: string;
  endpoints: Record<string, unknown>;
}

export function createCaapPlugin(config: AgentAuthSolanaConfig = {}): MinimalPlugin {
  const clawdMint = config.clawdMint ?? DEFAULT_CLAWD_MINT;

  function getHeliusRpcUrl(): string {
    const apiKey = config.heliusApiKey ?? process.env.HELIUS_API_KEY ?? "";
    if (!apiKey) return "https://api.mainnet-beta.solana.com";
    return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  }

  return {
    id: "caap-solana",
    endpoints: {
      // POST /caap/attest — runs attestAgent for a given agentId + walletAddress
      caapAttest: {
        method: "POST",
        path: "/caap/attest",
        async handler(ctx: {
          body: { agentId: string; walletAddress: string };
        }) {
          const { agentId, walletAddress } = ctx.body;
          if (!agentId || !walletAddress) {
            return { error: "agentId and walletAddress are required", status: 400 };
          }

          const opts = { heliusRpcUrl: getHeliusRpcUrl(), clawdMint };

          const [attestation, snapshot] = await Promise.allSettled([
            attestAgent(agentId, walletAddress, opts),
            fetchWalletSnapshot(walletAddress, opts),
          ]);

          const attestResult =
            attestation.status === "fulfilled"
              ? attestation.value
              : { verified: false, error: "attestation failed" };

          const snapshotResult =
            snapshot.status === "fulfilled" ? snapshot.value : null;

          const tierInfo = computeTier(snapshotResult?.clawdBalance ?? 0);

          return {
            caapVersion: "1.0",
            agentId,
            walletAddress,
            attestation: attestResult,
            snapshot: snapshotResult,
            tier: tierInfo,
          };
        },
      },

      // GET /caap/status/:agentId — lightweight status check
      caapStatus: {
        method: "GET",
        path: "/caap/status/:agentId",
        async handler(ctx: { params: { agentId: string }; query?: { wallet?: string } }) {
          const { agentId } = ctx.params;
          const wallet = ctx.query?.wallet;

          if (!wallet) {
            return {
              caapVersion: "1.0",
              agentId,
              status: "unverified",
              error: "wallet query param required",
            };
          }

          const opts = { heliusRpcUrl: getHeliusRpcUrl(), clawdMint };
          const result = await attestAgent(agentId, wallet, opts);

          return {
            caapVersion: "1.0",
            agentId,
            walletAddress: wallet,
            status: result.verified ? "verified" : "unverified",
            attestationHash: result.attestationHash,
            error: result.error,
          };
        },
      },

      // GET /caap/discovery — CAAP/1.0 protocol discovery document
      caapDiscovery: {
        method: "GET",
        path: "/caap/discovery",
        handler() {
          return {
            protocol: "CAAP/1.0",
            version: "1.0",
            name: "Clawd Agent Attestation Protocol",
            description:
              "Solana-native agent identity, verification, and subscription protocol",
            network: "solana-mainnet",
            clawdMint,
            tiers: {
              free: 0,
              bronze: 100_000,
              silver: 500_000,
              gold: 1_000_000,
              diamond: 5_000_000,
            },
            endpoints: {
              attest: "POST /caap/attest",
              status: "GET /caap/status/:agentId",
              discovery: "GET /caap/discovery",
            },
            links: {
              docs: "https://x402.wtf/agentauth",
              spec: "https://x402.wtf/agentauth#paper",
            },
          };
        },
      },
    },
  };
}
