/**
 * pay/src/x402-store.ts
 *
 * x402.wtf Real Store — merchant identity, per-product x402 challenge paths,
 * and the v2.1 manifest emitter used by `npm run list`.
 *
 * OpenClawd Pay is registered as a merchant on https://x402.wtf/agents/registry
 * and accepts real x402 challenges from https://x402.wtf/payments. Every
 * product exposes its own per-product challenge path so buyers can pay for a
 * single skill call without buying the whole catalog.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface X402Product {
  /** stable, URL-safe id (also used for the per-product challenge path) */
  id: string;
  /** human title */
  title: string;
  /** one-line description */
  summary: string;
  /** emoji avatar used by the storefront */
  avatar: string;
  /** per-product x402 challenge endpoint (relative to the worker origin) */
  challengePath: string;
  /** what the buyer gets after a verified receipt */
  deliverable: string;
  /** USDC price for one call */
  priceUsd: string;
  /** atomic units (USDC has 6 decimals) */
  priceAtomic: string;
  /** category for the storefront grid */
  category: "payments" | "discovery" | "identity" | "inference" | "attestation";
  tags: string[];
}

export interface X402StoreIdentity {
  merchant: {
    id: string;
    namespace: string;
    name: string;
    description: string;
    homepage: string;
    operatorWallet: string;
    feePayerWallet: string;
    network: string;
    rpcUrl: string;
  };
  registry: {
    url: string;
    paymentsUrl: string;
  };
  manifest: {
    version: string;
    issuedAt: string;
  };
  challenges: {
    /** Default per-call challenge used by the operator surface */
    default: string;
    /** Per-product challenge paths (one per product) */
    products: Record<string, string>;
  };
  products: X402Product[];
  apigee: {
    proxyBase: string;
    env: string;
    policies: string[];
    faultRule: string;
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORE_BASE = "https://x402.wtf";
const STORE_NAMESPACE = "openclawd-pay";
const REGISTRY_URL = `${STORE_BASE}/agents/registry`;
const PAYMENTS_URL = `${STORE_BASE}/payments`;

/**
 * Operator + fee-payer wallet. The operator wallet is the merchant controller
 * for the x402.wtf registry; the fee-payer wallet settles receipts on-chain.
 */
const OPERATOR_WALLET = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const FEE_PAYER_WALLET = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const RPC_URL = "https://api.mainnet-beta.solana.com";
const NETWORK = "solana-mainnet";

const APIGEE_BASE = "https://apigee.x402.wtf/v1/solana-clawd-pay";
const APIGEE_ENV = "prod";

/**
 * The product catalog. Each product gets a per-product x402 challenge path
 * exposed by the worker and forwarded to https://x402.wtf/payments.
 */
export const X402_PRODUCTS: X402Product[] = [
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

const DEFAULT_CHALLENGE_PATH = "/api/x402wtf/checkout?product=pay-quote";

// ─── Manifest builder ───────────────────────────────────────────────────────

/**
 * Build the merchant manifest. This is the v2.1 manifest emitted at
 * `GET /api/x402wtf/info` and on disk by `npm run list`.
 *
 * The top-level `x402` block is the part the x402.wtf merchant registry
 * reads to verify our identity and discover the per-product challenge paths.
 */
export function buildManifest(
  origin: string = STORE_BASE,
  issuedAt: string = new Date().toISOString(),
): X402StoreIdentity {
  return {
    merchant: {
      id: STORE_NAMESPACE,
      namespace: STORE_NAMESPACE,
      name: "OpenClawd Pay",
      description:
        "x402 + Solana MPP payment gateway for the OpenClawd agent fleet. " +
        "Wired up as a real paid x402.wtf merchant that proxies per-product " +
        "challenges from https://x402.wtf/payments.",
      homepage: origin,
      operatorWallet: OPERATOR_WALLET,
      feePayerWallet: FEE_PAYER_WALLET,
      network: NETWORK,
      rpcUrl: RPC_URL,
    },
    registry: {
      url: REGISTRY_URL,
      paymentsUrl: PAYMENTS_URL,
    },
    manifest: {
      version: "2.1",
      issuedAt,
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
  };
}

// ─── Per-product challenge builder ──────────────────────────────────────────

export interface X402Challenge {
  productId: string;
  price: { usd: string; atomic: string; asset: string };
  acceptedNetworks: string[];
  challengePath: string;
  upstream: string;
  issuedAt: string;
  expiresAt: string;
  /** Headers a buyer should send when they retry with a payment-signature */
  retryHeaders: Record<string, string>;
  /** Top-level x402 challenge description, mirrors the storefront lab */
  message: string;
  nonce: string;
}

const ACCEPTED_NETWORKS = ["base-sepolia", "base", "solana"];

/**
 * Build a per-product x402 challenge. The challenge is what a buyer
 * receives from the worker (which proxies https://x402.wtf/payments) and
 * must satisfy before their call is forwarded upstream.
 */
export function buildChallenge(
  productId: string,
  baseOrigin: string = STORE_BASE,
  upstream: string = `${STORE_BASE}/payments/checkout`,
): X402Challenge | null {
  const product = X402_PRODUCTS.find((p) => p.id === productId);
  if (!product) return null;

  const now = Date.now();
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + 5 * 60_000).toISOString();
  const nonce = btoa(`${productId}:${now}:${Math.random()}`).replace(/=+$/, "");

  return {
    productId,
    price: {
      usd: product.priceUsd,
      atomic: product.priceAtomic,
      asset: "USDC",
    },
    acceptedNetworks: ACCEPTED_NETWORKS,
    challengePath: product.challengePath,
    upstream,
    issuedAt,
    expiresAt,
    nonce,
    retryHeaders: {
      "X-Payment": "<base64 payment-signature from x402.wtf>",
      "X-Clawd-Product": product.id,
      "X-Clawd-Nonce": nonce,
    },
    message:
      `Pay ${product.priceUsd} USDC via https://x402.wtf/payments to unlock ` +
      `${product.title}. Forward the resulting payment-signature in the ` +
      `X-Payment header to ${baseOrigin}${product.challengePath}.`,
  };
}

// ─── Helpers used by index.ts ───────────────────────────────────────────────

export function getProductById(id: string): X402Product | undefined {
  return X402_PRODUCTS.find((p) => p.id === id);
}

export function listProductIds(): string[] {
  return X402_PRODUCTS.map((p) => p.id);
}

export const X402_STORE_CONSTANTS = {
  STORE_BASE,
  STORE_NAMESPACE,
  REGISTRY_URL,
  PAYMENTS_URL,
  OPERATOR_WALLET,
  FEE_PAYER_WALLET,
  RPC_URL,
  NETWORK,
  APIGEE_BASE,
  APIGEE_ENV,
  ACCEPTED_NETWORKS,
  DEFAULT_CHALLENGE_PATH,
} as const;
