/**
 * agents/cli/src/commands/sign.ts
 *
 * Sign a base64-encoded Solana transaction using the Pay account
 * and submit it to the network.
 *
 * Usage:
 *   clawd-agents sign <BASE64_TX> [--network devnet] [--account my-account] [--json]
 *
 * Bridges to pay.sh signing core via the Pay MCP sign_transaction tool.
 */

import { printSection, printOk, printInfo, printWarn, printDone } from "../banner.js";

const PAY_BASE_URL = process.env.PAY_BASE_URL ?? "https://x402.wtf";

interface SignResult {
  success: boolean;
  signature?: string;
  signer?: string;
  network?: string;
  requiredSigners?: number;
  version?: string;
  explorerUrl?: string;
  error?: string;
  code?: string;
}

export async function runSign(
  base64Tx: string,
  opts: { network?: string; account?: string; json?: boolean },
): Promise<void> {
  printSection("Solana Transaction Sign + Submit");

  if (!base64Tx || base64Tx.length < 20) {
    throw new Error("Invalid base64 transaction — must be at least 20 characters.");
  }

  printInfo(`Transaction: ${base64Tx.slice(0, 40)}...${base64Tx.slice(-8)}`);
  printInfo(`Network:     ${opts.network ?? "mainnet-beta"}`);
  if (opts.account) printInfo(`Account:     ${opts.account}`);

  // Call Pay sign_transaction endpoint
  const payload = {
    transaction: base64Tx,
    network: opts.network ?? "mainnet-beta",
    account: opts.account,
  };

  printInfo(`Calling: ${PAY_BASE_URL}/v1/sign/transaction`);

  let result: SignResult;
  try {
    const res = await fetch(`${PAY_BASE_URL}/v1/sign/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });

    if (res.ok) {
      const body = (await res.json()) as {
        content?: Array<{ type: string; text: string }>;
      };

      // Unwrap MCP response format if present
      if (body.content && body.content.length > 0 && body.content[0].text) {
        result = JSON.parse(body.content[0].text) as SignResult;
      } else {
        result = body as unknown as SignResult;
      }
    } else {
      const errBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      result = {
        success: false,
        error: (errBody.error as string) ?? `HTTP ${res.status}`,
        code: errBody.code as string | undefined,
      };
    }
  } catch (err: any) {
    if (err.name === "AbortError" || err.message?.includes("timeout")) {
      throw new Error("Transaction signing timed out (60s). The RPC may be slow — check network congestion.");
    }
    if (err.message?.includes("fetch failed") || err.message?.includes("ECONNREFUSED")) {
      throw new Error(
        `Pay gateway unreachable at ${PAY_BASE_URL}\n` +
        "Start Pay worker: cd pay && npm run dev\n" +
        "Or set PAY_BASE_URL to a running instance.",
      );
    }
    throw err;
  }

  if (result.success && result.signature) {
    if (opts.json) {
      console.log(JSON.stringify({
        signature: result.signature,
        signer: result.signer,
        network: result.network,
        requiredSigners: result.requiredSigners,
        version: result.version,
        explorerUrl: result.explorerUrl ??
          `https://explorer.solana.com/tx/${result.signature}?cluster=${result.network === "mainnet-beta" ? "" : result.network}`,
      }, null, 2));
    } else {
      printOk("Transaction confirmed ✓");
      console.error(`\n  Signature:      ${result.signature}`);
      console.error(`  Signer:         ${result.signer}`);
      console.error(`  Network:        ${result.network}`);
      console.error(`  Version:        ${result.version}`);
      console.error(`  Required Sigs:  ${result.requiredSigners}`);
      const explorer = result.explorerUrl ??
        `https://explorer.solana.com/tx/${result.signature}?cluster=${result.network === "mainnet-beta" ? "" : result.network}`;
      console.error(`\n  Explorer: ${explorer}`);
    }
  } else {
    if (opts.json) {
      console.log(JSON.stringify({ success: false, error: result.error, code: result.code }, null, 2));
    }
    throw new Error(
      `Signing failed: ${result.error ?? "Unknown error"}\n` +
      `Code: ${result.code ?? "N/A"}\n` +
      "Check:\n" +
      "  1. PAY_PRIVATE_KEY or SOLANA_PRIVATE_KEY is set in environment\n" +
      "  2. The Pay account is a required signer for this transaction\n" +
      "  3. The transaction is valid base64-encoded bytes",
    );
  }

  printDone("Transaction signed and submitted");
}