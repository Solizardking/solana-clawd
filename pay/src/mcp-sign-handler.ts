/**
 * pay/src/mcp-sign-handler.ts
 *
 * MCP tool handler for sign_transaction — the bridge between
 * MCP tool invocations and the core sign.ts signing logic.
 *
 * Resolves network/account from environment variables:
 *   PAY_NETWORK_ENFORCED  — override network
 *   PAY_ACTIVE_ACCOUNT    — account name selector
 *   PAY_RPC_URL           — custom RPC endpoint
 *   PAY_PRIVATE_KEY       — base58 private key
 *
 * Honors existing MCP routing patterns used by Pay.
 */

import { signAndSubmit, SignConfig, SignResult, SignErrorCode } from "./sign.js";

// ─── MCP Tool Definition ────────────────────────────────────────────────────

export const SIGN_TRANSACTION_TOOL = {
  name: "sign_transaction",
  description:
    "Sign a base64-encoded Solana transaction (legacy or v0) with the " +
    "selected Pay account and submit it to the network. " +
    "Returns the confirmed transaction signature. " +
    "Use only when explicitly requested by the user.",
  inputSchema: {
    type: "object" as const,
    properties: {
      transaction: {
        type: "string",
        description: "Base64-encoded Solana transaction bytes (legacy or v0)",
      },
      network: {
        type: "string",
        description: "Solana network: mainnet-beta, devnet, or testnet",
        enum: ["mainnet-beta", "devnet", "testnet"],
      },
      account: {
        type: "string",
        description: "Optional account name to select which Pay key to use",
      },
    },
    required: ["transaction"],
  },
};

// ─── MCP Handler ────────────────────────────────────────────────────────────

export interface McpSignInput {
  transaction: string;
  network?: string;
  account?: string;
}

export interface McpSignResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

function resolveNetwork(
  requested?: string,
  enforced?: string,
): string {
  const normalized = (v?: string) => v?.trim().toLowerCase() || undefined;
  const choice = normalized(enforced) ?? normalized(requested) ?? "mainnet-beta";
  if (!["mainnet-beta", "devnet", "testnet"].includes(choice)) {
    return "mainnet-beta";
  }
  return choice;
}

function resolveAccount(
  _requested?: string,
  _enforced?: string,
): string | undefined {
  // In a multi-account setup, use env override. For now, single-account.
  return undefined;
}

export async function handleSignTransaction(
  input: McpSignInput,
  env?: Record<string, string | undefined>,
): Promise<McpSignResponse> {
  const network = resolveNetwork(
    input.network,
    env?.PAY_NETWORK_ENFORCED,
  );

  const privateKey =
    env?.PAY_PRIVATE_KEY ??
    env?.SOLANA_PRIVATE_KEY ??
    process.env.PAY_PRIVATE_KEY ??
    process.env.SOLANA_PRIVATE_KEY;

  if (!privateKey) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: "Pay private key not configured",
              code: SignErrorCode.MISSING_PRIVATE_KEY,
              help: "Set PAY_PRIVATE_KEY or SOLANA_PRIVATE_KEY environment variable with a base58-encoded Solana private key.",
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  const config: SignConfig = {
    privateKey,
    network,
    rpcUrl: env?.PAY_RPC_URL ?? process.env.PAY_RPC_URL,
    commitment: "confirmed",
  };

  try {
    const result: SignResult = await signAndSubmit(input.transaction, config);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              signature: result.signature,
              signer: result.signer,
              network: result.network,
              requiredSigners: result.requiredSigners,
              version: result.version,
              explorerUrl: `https://explorer.solana.com/tx/${result.signature}?cluster=${result.network === "mainnet-beta" ? "" : result.network}`,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (err: any) {
    const code = err?.code ?? SignErrorCode.SUBMISSION_FAILED;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: err?.message ?? "Unknown signing error",
              code,
              detail: err?.detail,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
}