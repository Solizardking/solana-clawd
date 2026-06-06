// CAAP Better Auth plugin — wraps SIWS from better-auth-solana and adds
// attestation, on-chain identity (Metaplex Agent Registry), and Genesis
// token launch endpoints for the Clawd Agent Attestation Protocol.

import type { AgentAuthSolanaConfig } from "./types";
import { attestAgent, fetchWalletSnapshot } from "./attestation";
import { computeTier } from "./subscription";
import {
  buildEip8004Registration,
  buildRegisterIdentityParams,
  buildDelegateExecutionParams,
  buildSetAgentTokenParams,
  verifyAgentRegistration,
  fetchAgentRegistrationDoc,
} from "./identity";
import {
  buildGenesisLaunchInput,
  validateGenesisLaunchInput,
} from "./genesis";
import type { AgentIdentityConfig } from "./identity";

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

  function getIdentityRpcUrl(): string {
    return (
      config.identityRpcUrl ??
      process.env.SOLANA_RPC_URL ??
      getHeliusRpcUrl()
    );
  }

  return {
    id: "caap-solana",
    endpoints: {
      // ── CAAP Attestation ────────────────────────────────────────────
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

      // ── CAAP Status ─────────────────────────────────────────────────
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

      // ── CAAP Discovery ──────────────────────────────────────────────
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
              identity: "POST /agent/identity/register",
              verifyIdentity: "GET /agent/identity/verify/:asset",
              tokenLaunch: "POST /agent/token/launch",
            },
            links: {
              docs: "https://x402.wtf/agentauth",
              spec: "https://x402.wtf/agentauth#paper",
            },
          };
        },
      },

      // ── Agent Identity Registration (Metaplex-compatible) ───────────
      // POST /agent/identity/register — build registerIdentityV1 params
      // and the EIP-8004 registration document
      agentIdentityRegister: {
        method: "POST",
        path: "/agent/identity/register",
        async handler(ctx: {
          body: {
            agentId: string;
            asset: string;
            collection?: string;
            identityConfig: AgentIdentityConfig;
          };
        }) {
          const { agentId, asset, collection, identityConfig } = ctx.body;

          if (!agentId || !asset || !identityConfig) {
            return {
              error: "agentId, asset, and identityConfig are required",
              status: 400,
            };
          }

          if (!identityConfig.name || !identityConfig.description || !identityConfig.image) {
            return {
              error: "identityConfig requires name, description, and image",
              status: 400,
            };
          }

          // Set the asset public key on the config for cross-referencing
          identityConfig.assetPublicKey = asset;

          // Build the EIP-8004 registration document
          const eip8004Doc = buildEip8004Registration(identityConfig);

          // Build the registerIdentityV1 instruction parameters
          const registerParams = buildRegisterIdentityParams({
            asset,
            collection,
            agentRegistrationUri: identityConfig.image, // placeholder — upload to Arweave first
          });

          return {
            agentId,
            asset,
            identityPda: registerParams.identityPda,
            assetSignerPda: registerParams.assetSignerPda,
            eip8004Document: eip8004Doc,
            registerParams,
            instructions: {
              summary:
                "Use registerIdentityV1(umi, registerParams).sendAndConfirm(umi) from @metaplex-foundation/mpl-agent-registry",
              sdk: "mpl-agent-registry",
              method: "registerIdentityV1",
            },
          };
        },
      },

      // ── Verify Agent Identity ───────────────────────────────────────
      // GET /agent/identity/verify/:asset — check on-chain registration
      agentIdentityVerify: {
        method: "GET",
        path: "/agent/identity/verify/:asset",
        async handler(ctx: {
          params: { asset: string };
        }) {
          const { asset } = ctx.params;
          if (!asset) {
            return { error: "asset (MPL Core asset public key) is required", status: 400 };
          }

          const result = await verifyAgentRegistration(asset, getIdentityRpcUrl());

          // Also try to fetch the registration doc if we have a URI
          let registrationDoc = null;
          if (result.uri) {
            registrationDoc = await fetchAgentRegistrationDoc(result.uri);
          }

          return {
            asset,
            ...result,
            registrationDoc,
          };
        },
      },

      // ── Delegate Execution ──────────────────────────────────────────
      // POST /agent/identity/delegate — build delegateExecutionV1 params
      agentIdentityDelegate: {
        method: "POST",
        path: "/agent/identity/delegate",
        async handler(ctx: {
          body: {
            agentAsset: string;
            executiveAuthority: string;
            payer?: string;
          };
        }) {
          const { agentAsset, executiveAuthority, payer } = ctx.body;

          if (!agentAsset || !executiveAuthority) {
            return {
              error: "agentAsset and executiveAuthority are required",
              status: 400,
            };
          }

          const delegateParams = buildDelegateExecutionParams({
            agentAsset,
            executiveAuthority,
            payer,
          });

          return {
            agentAsset,
            executiveAuthority,
            ...delegateParams,
            instructions: {
              summary:
                "Use delegateExecutionV1(umi, params).sendAndConfirm(umi) from @metaplex-foundation/mpl-agent-registry",
              sdk: "mpl-agent-registry",
              method: "delegateExecutionV1",
            },
          };
        },
      },

      // ── Set Agent Token (Permanent Binding) ─────────────────────────
      // POST /agent/token/set — build setAgentTokenV1 params
      agentTokenSet: {
        method: "POST",
        path: "/agent/token/set",
        async handler(ctx: {
          body: {
            agentAsset: string;
            agentCollection: string;
            genesisAccount: string;
          };
        }) {
          const { agentAsset, agentCollection, genesisAccount } = ctx.body;

          if (!agentAsset || !agentCollection || !genesisAccount) {
            return {
              error: "agentAsset, agentCollection, and genesisAccount are required",
              status: 400,
            };
          }

          const setTokenParams = buildSetAgentTokenParams({
            agentAsset,
            agentCollection,
            genesisAccount,
          });

          return {
            agentAsset,
            ...setTokenParams,
            warning:
              "setAgentTokenV1 is IRREVERSIBLE. Once set, the token binding cannot be changed, replaced, or unset.",
            instructions: {
              summary:
                "Wrap in Core Execute: await execute(umi, { asset, collection, instructions: setAgentTokenV1(umi, params) }).sendAndConfirm(umi)",
              sdk: "mpl-agent-registry + mpl-core",
              method: "setAgentTokenV1",
            },
          };
        },
      },

      // ── Token Launch (Genesis Bonding Curve) ────────────────────────
      // POST /agent/token/launch — build genesis launch input
      agentTokenLaunch: {
        method: "POST",
        path: "/agent/token/launch",
        async handler(ctx: {
          body: {
            agentAsset: string;
            setToken?: boolean;
            payer: string;
            tokenName: string;
            tokenSymbol: string;
            tokenImage: string;
            tokenDescription?: string;
            firstBuyAmount?: number;
            network?: "solana-mainnet" | "solana-devnet";
            creatorFeeWallet?: string;
          };
        }) {
          const launchInput = buildGenesisLaunchInput(ctx.body);
          const validationErrors = validateGenesisLaunchInput(launchInput);

          if (validationErrors.length > 0) {
            return {
              error: "Validation failed",
              validationErrors,
              status: 400,
            };
          }

          return {
            agentAsset: ctx.body.agentAsset,
            setToken: ctx.body.setToken ?? true,
            launchInput,
            warnings: ctx.body.setToken !== false
              ? [
                  "setToken: true is IRREVERSIBLE — the token will be permanently bound to this agent.",
                  "token.image must be an Irys gateway URL (https://gateway.irys.xyz/...)",
                ]
              : ["token.image must be an Irys gateway URL (https://gateway.irys.xyz/...)"],
            instructions: {
              summary:
                "Use createAndRegisterLaunch(umi, {}, launchInput) from @metaplex-foundation/genesis/api",
              sdk: "@metaplex-foundation/genesis",
              method: "createAndRegisterLaunch",
              cli: `mplx genesis launch create --launchType bonding-curve --name "${ctx.body.tokenName}" --symbol "${ctx.body.tokenSymbol}" --image "${ctx.body.tokenImage}" --agentAsset ${ctx.body.agentAsset} --agentSetToken`,
            },
          };
        },
      },
    },
  };
}
