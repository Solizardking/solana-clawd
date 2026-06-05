export interface Env {
  ENVIRONMENT?: string;
  PRICE_USD?: string;
  PRICE_ATOMIC?: string;
  PAYMENT_ASSET?: string;
  PAYMENT_NETWORKS?: string;
  CLAWDROUTER_URL?: string;
  CLAWDROUTER_API_KEY?: string;
  X402_OPENROUTER_URL?: string;
  OPENROUTER_API_KEY?: string;
  OPENCLAWD_SITE_URL?: string;
  AGENT_REGISTRY_URL?: string;
  MPP_PROXY_URL?: string;
  MPP_PROXY_TOKEN?: string;
  SOLANA_MPP_ENABLED?: string;
  RECEIPT_HMAC_SECRET?: string;
}

type JsonRecord = Record<string, unknown>;

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-Payment,Payment-Receipt,X-Clawd-Pay-Receipt,X-Agent-Asset,X-Clawd-Wallet",
};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...init.headers,
    },
  });
}

function envList(value: string | undefined, fallback: string[]) {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items && items.length > 0 ? items : fallback;
}

function baseQuote(env: Env) {
  const networks = envList(env.PAYMENT_NETWORKS, [
    "base-sepolia",
    "base",
    "solana",
  ]);

  return {
    service: "solana-clawd-pay",
    version: "0.1.0",
    price: {
      usd: env.PRICE_USD ?? "0.01",
      atomic: env.PRICE_ATOMIC ?? "10000",
      asset: env.PAYMENT_ASSET ?? "USDC",
    },
    networks,
    rails: {
      x402: {
        enabled: Boolean(env.X402_OPENROUTER_URL),
        url: env.X402_OPENROUTER_URL || null,
        header: "X-Payment",
      },
      mpp: {
        enabled: env.SOLANA_MPP_ENABLED === "true",
        url: env.MPP_PROXY_URL || null,
        authScheme: "Payment",
        receiptHeader: "Payment-Receipt",
      },
      solana: {
        enabled: networks.includes("solana"),
        proxyRequired: true,
        note:
          "Verify Solana SOL/SPL receipts in an MPP/x402 proxy, then forward verified requests here.",
      },
    },
    upstreams: {
      clawdrouter: env.CLAWDROUTER_URL || null,
      x402OpenRouter: env.X402_OPENROUTER_URL || null,
      directOpenRouter: Boolean(env.OPENROUTER_API_KEY),
    },
  };
}

async function hmacSha256(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifyLocalReceipt(receipt: string, env: Env) {
  if (!env.RECEIPT_HMAC_SECRET) {
    return { verified: false, reason: "missing_receipt_hmac_secret" };
  }

  const [payload, signature] = receipt.split(".");
  if (!payload || !signature) {
    return { verified: false, reason: "invalid_receipt_format" };
  }

  const expected = await hmacSha256(env.RECEIPT_HMAC_SECRET, payload);
  return {
    verified: signature === expected,
    reason: signature === expected ? "hmac_valid" : "hmac_mismatch",
  };
}

async function verifyViaMppProxy(receipt: string, env: Env) {
  if (!env.MPP_PROXY_URL) {
    return { verified: false, reason: "missing_mpp_proxy_url" };
  }

  const response = await fetch(`${env.MPP_PROXY_URL.replace(/\/$/, "")}/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.MPP_PROXY_TOKEN
        ? { Authorization: `Bearer ${env.MPP_PROXY_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ receipt }),
  });

  if (!response.ok) {
    return {
      verified: false,
      reason: `mpp_proxy_http_${response.status}`,
      detail: await response.text(),
    };
  }

  return response.json();
}

function extractReceipt(request: Request) {
  return (
    request.headers.get("Payment-Receipt") ||
    request.headers.get("X-Clawd-Pay-Receipt") ||
    request.headers.get("Authorization")?.replace(/^Payment\s+/i, "") ||
    request.headers.get("X-Payment") ||
    ""
  );
}

async function isPaidOrDelegated(request: Request, env: Env) {
  const receipt = extractReceipt(request);
  if (!receipt) return { ok: false, reason: "missing_payment_receipt" };

  if (env.MPP_PROXY_URL) {
    const result = (await verifyViaMppProxy(receipt, env)) as JsonRecord;
    return {
      ok: result.verified === true || result.ok === true,
      reason: result.reason ?? "mpp_proxy",
      receipt: result,
    };
  }

  const local = await verifyLocalReceipt(receipt, env);
  return { ok: local.verified, reason: local.reason, receipt: local };
}

async function forwardChat(request: Request, env: Env) {
  const paid = await isPaidOrDelegated(request, env);
  if (!paid.ok && !env.X402_OPENROUTER_URL) {
    return json(
      {
        error: "payment_required",
        message:
          "Provide X-Payment, Authorization: Payment, Payment-Receipt, or X-Clawd-Pay-Receipt.",
        quote: baseQuote(env),
        verification: paid,
      },
      { status: 402, headers: { "WWW-Authenticate": "Payment" } },
    );
  }

  const body = (await request.json()) as JsonRecord;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Solana-Clawd-Pay": "1",
  };

  const agentAsset = request.headers.get("X-Agent-Asset");
  if (agentAsset) headers["X-Agent-Asset"] = agentAsset;

  let upstream = env.CLAWDROUTER_URL;
  if (upstream && env.CLAWDROUTER_API_KEY) {
    headers.Authorization = `Bearer ${env.CLAWDROUTER_API_KEY}`;
  }

  if (!upstream && env.X402_OPENROUTER_URL) {
    upstream = env.X402_OPENROUTER_URL;
    const payment = request.headers.get("X-Payment");
    if (payment) headers["X-Payment"] = payment;
  }

  if (!upstream && env.OPENROUTER_API_KEY) {
    upstream = "https://openrouter.ai/api/v1";
    headers.Authorization = `Bearer ${env.OPENROUTER_API_KEY}`;
    headers["HTTP-Referer"] = env.OPENCLAWD_SITE_URL ?? "https://solanaclawd.com";
    headers["X-Title"] = "Solana Clawd Pay";
  }

  if (!upstream) {
    return json(
      { error: "no_upstream_configured", quote: baseQuote(env) },
      { status: 503 },
    );
  }

  const response = await fetch(
    `${upstream.replace(/\/$/, "")}/v1/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: body.model ?? "auto",
        ...body,
        metadata: {
          ...(typeof body.metadata === "object" && body.metadata
            ? body.metadata
            : {}),
          solanaClawdPay: true,
          paymentVerification: paid.reason,
        },
      }),
    },
  );

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("X-Solana-Clawd-Pay", "1");
  responseHeaders.set("X-Clawd-Pay-Upstream", upstream);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

function paymentChallenge(env: Env) {
  const quote = baseQuote(env);
  return {
    status: 402,
    scheme: "Payment",
    intent: "charge",
    amount: quote.price,
    accepted: quote.networks,
    headers: {
      challenge: "WWW-Authenticate: Payment",
      retry: "Authorization: Payment <credential>",
      receipt: "Payment-Receipt",
    },
    mpp: quote.rails.mpp,
    x402: quote.rails.x402,
  };
}

function commerceAgent(env: Env, request: Request) {
  const url = new URL(request.url);
  const agentAsset = url.searchParams.get("agentAsset") || "<agent-core-asset>";

  return {
    agenticCommerce: true,
    agentAsset,
    registry: {
      url: env.AGENT_REGISTRY_URL || null,
      metaplex: {
        identity: "Agent Registry MPL Core asset identity",
        execution: "Register executive profile, then delegate execution",
        tokenLaunch:
          "Launch agent token through Metaplex Genesis bonding curve, then bind with set-agent-token",
      },
    },
    payments: baseQuote(env),
    services: {
      inference: "/v1/chat/completions",
      quote: "/v1/payments/quote",
      challenge: "/v1/payments/challenge",
      receipt: "/v1/payments/receipt",
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        service: "solana-clawd-pay",
        environment: env.ENVIRONMENT ?? "development",
        quote: baseQuote(env),
      });
    }

    if (url.pathname === "/v1/payments/quote") {
      return json(baseQuote(env));
    }

    if (url.pathname === "/v1/payments/challenge") {
      return json(paymentChallenge(env), {
        status: 402,
        headers: { "WWW-Authenticate": "Payment" },
      });
    }

    if (url.pathname === "/v1/payments/receipt" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as JsonRecord;
      const receipt =
        typeof body.receipt === "string" ? body.receipt : extractReceipt(request);
      if (!receipt) {
        return json({ verified: false, reason: "missing_receipt" }, { status: 400 });
      }
      const result = env.MPP_PROXY_URL
        ? await verifyViaMppProxy(receipt, env)
        : await verifyLocalReceipt(receipt, env);
      return json(result);
    }

    if (url.pathname === "/v1/commerce/agent") {
      return json(commerceAgent(env, request));
    }

    if (url.pathname === "/v1/chat/completions" && request.method === "POST") {
      return forwardChat(request, env);
    }

    return json({ error: "not_found" }, { status: 404 });
  },
};
