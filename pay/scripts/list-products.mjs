#!/usr/bin/env node
/**
 * pay/scripts/list-products.mjs
 *
 * `npm run list` — emit the merchant v2.1 manifest on disk and to stdout.
 *
 * Pulls the same X402_PRODUCTS table that the worker uses, builds the
 * v2.1 manifest, writes it to ./dist/manifest.json and ./manifest.json,
 * and prints a compact product table.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// ─── Load the .ts source via tsx-style hook (or build on demand) ────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// We re-implement the manifest builder here in JS so that `npm run list`
// does NOT require building the worker first. This stays in sync with
// `pay/src/x402-store.ts`. If you change the catalog, change both.

const STORE_BASE = "https://x402.wtf";
const STORE_NAMESPACE = "openclawd-pay";
const REGISTRY_URL = `${STORE_BASE}/agents/registry`;
const PAYMENTS_URL = `${STORE_BASE}/payments`;
const OPERATOR_WALLET = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const FEE_PAYER_WALLET = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const RPC_URL = "https://api.mainnet-beta.solana.com";
const NETWORK = "solana-mainnet";
const APIGEE_BASE = "https://apigee.x402.wtf/v1/solana-clawd-pay";
const APIGEE_ENV = "prod";
const MANIFEST_VERSION = "2.1";
const DEFAULT_CHALLENGE_PATH = "/api/x402wtf/checkout?product=pay-quote";

const X402_PRODUCTS = [
  {
    id: "pay-quote",
    title: "x402 Quote",
    summary: "One normalized x402 quote for any agent in the fleet.",
    avatar: "🧾",
    challengePath: "/api/x402wtf/checkout?product=pay-quote",
    deliverable: "JSON quote with USDC price, accepted networks, and challenge headers.",
    priceUsd: "0.01",
    priceAtomic: "10000",
    category: "payments",
    tags: ["x402", "quote", "usdc", "fleet"],
  },
  {
    id: "agent-chat",
    title: "Agent Chat (x402-gated)",
    summary: "Send one prompt to a Clawd agent, pay per call with USDC.",
    avatar: "💬",
    challengePath: "/api/x402wtf/agent/chat?product=agent-chat",
    deliverable: "Forwarded model reply + x402 receipt anchor.",
    priceUsd: "0.01",
    priceAtomic: "10000",
    category: "inference",
    tags: ["x402", "chat", "usdc", "claude", "openai"],
  },
  {
    id: "pay-attest",
    title: "Payment Attestation",
    summary: "Anchor a verified x402 receipt on Solana via dna-x402.",
    avatar: "🪪",
    challengePath: "/api/x402wtf/checkout?product=pay-attest",
    deliverable: "Signed SAS attestation linking the receipt to the agent wallet.",
    priceUsd: "0.05",
    priceAtomic: "50000",
    category: "attestation",
    tags: ["x402", "attestation", "sas", "dna-x402"],
  },
  {
    id: "agent-registry",
    title: "Agent Registry Lookup",
    summary: "Resolve a single agent by id and return its full MCP surface.",
    avatar: "🔎",
    challengePath: "/api/x402wtf/agents?product=agent-registry",
    deliverable: "Single agent MCP card + supported x402 protocols.",
    priceUsd: "0.005",
    priceAtomic: "5000",
    category: "discovery",
    tags: ["x402", "discovery", "mcp", "registry"],
  },
  {
    id: "registry-register",
    title: "Merchant Registration",
    summary: "Register a new operator wallet as a paid merchant on x402.wtf.",
    avatar: "📝",
    challengePath: "/api/x402wtf/register?product=registry-register",
    deliverable: "Operator pubkey + namespace registered at x402.wtf/agents/registry.",
    priceUsd: "0.10",
    priceAtomic: "100000",
    category: "identity",
    tags: ["x402", "registration", "merchant", "registry"],
  },
  {
    id: "receipt-verify",
    title: "Receipt Verify",
    summary: "Verify a single x402 receipt on-chain and return the anchor.",
    avatar: "🧪",
    challengePath: "/api/x402wtf/verify?product=receipt-verify",
    deliverable: "Receipt verification result + Solana tx signature.",
    priceUsd: "0.005",
    priceAtomic: "5000",
    category: "payments",
    tags: ["x402", "verify", "receipt", "dna-x402"],
  },
];

const origin = process.env.X402_STORE_BASE || STORE_BASE;
const issuedAt = new Date().toISOString();

const manifest = {
  $schema: "https://x402.wtf/schema/openclawd-merchant.v2.1.json",
  x402: {
    version: MANIFEST_VERSION,
    namespace: STORE_NAMESPACE,
    store: {
      name: "OpenClawd Pay",
      description:
        "x402 + Solana MPP payment gateway for the OpenClawd agent fleet. " +
        "Wired up as a real paid x402.wtf merchant that proxies per-product " +
        "challenges from https://x402.wtf/payments.",
      homepage: origin,
    },
    merchant: {
      id: STORE_NAMESPACE,
      operatorWallet: OPERATOR_WALLET,
      feePayerWallet: FEE_PAYER_WALLET,
      network: NETWORK,
      rpcUrl: RPC_URL,
    },
    registry: {
      url: REGISTRY_URL,
      paymentsUrl: PAYMENTS_URL,
    },
    challenges: {
      default: DEFAULT_CHALLENGE_PATH,
      products: Object.fromEntries(
        X402_PRODUCTS.map((p) => [p.id, p.challengePath]),
      ),
    },
    products: X402_PRODUCTS,
    apigee: {
      proxyBase: APIGEE_BASE,
      env: APIGEE_ENV,
      policies: ["AM-SetX402Headers", "AM-SetX402ChallengePath"],
      faultRule: "RF-X402Challenge",
    },
  },
  manifest: {
    version: MANIFEST_VERSION,
    issuedAt,
  },
};

// ─── Output ────────────────────────────────────────────────────────────────

const outTargets = [
  resolve(ROOT, "dist/manifest.json"),
  resolve(ROOT, "manifest.json"),
];

for (const target of outTargets) {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

console.log(`🪪  OpenClawd Pay — x402.wtf merchant catalog (v${MANIFEST_VERSION})`);
console.log(`    issued:    ${issuedAt}`);
console.log(`    namespace: ${STORE_NAMESPACE}`);
console.log(`    operator:  ${OPERATOR_WALLET}`);
console.log(`    fee-payer: ${FEE_PAYER_WALLET}`);
console.log(`    products:  ${X402_PRODUCTS.length}`);
console.log("");
console.log("  " + "id".padEnd(22) + "price".padEnd(8) + "category".padEnd(14) + "challenge-path");
console.log("  " + "─".repeat(78));
for (const p of X402_PRODUCTS) {
  console.log(
    "  " +
      p.avatar +
      " " +
      p.id.padEnd(20) +
      `$${p.priceUsd}`.padEnd(8) +
      p.category.padEnd(14) +
      p.challengePath,
  );
}
console.log("");
console.log(`✔  wrote ${outTargets.join(", ")}`);
