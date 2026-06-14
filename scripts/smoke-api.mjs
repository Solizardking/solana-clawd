#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL || process.argv[2] || "http://127.0.0.1:5057").replace(/\/$/, "");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 12_000);

const tests = [
  // Core runtime
  { name: "health", path: "/api/health", expect: [200], required: true },
  { name: "public config", path: "/api/public-config", expect: [200], required: true },
  { name: "spa root", path: "/", expect: [200], required: true, text: true },
  { name: "dex route", path: "/dex", expect: [200], required: true, text: true },
  { name: "swap route", path: "/swap", expect: [200], required: true, text: true },
  { name: "perps route", path: "/perps", expect: [200], required: true, text: true },

  // Auth and discovery
  { name: "agent configuration", path: "/.well-known/agent-configuration", expect: [200, 404, 503], required: false },
  { name: "auth entry", path: "/api/auth/entry", expect: [200], required: true },
  { name: "auth challenge missing wallet", path: "/api/auth/challenge", expect: [400, 422], required: true },
  { name: "auth me unauthenticated", path: "/api/auth/me", expect: [200, 401], required: true },
  { name: "auth status", path: "/api/auth/status", expect: [200], required: true },
  { name: "developer api status", path: "/api/developer/status", expect: [200], required: true },
  { name: "developer openapi", path: "/api/developer/openapi.json", expect: [200], required: true },
  {
    name: "developer llms",
    path: "/api/developer/llms.txt",
    expect: [200],
    required: true,
    text: true,
    textIncludes: "# Cheshire Terminal API",
  },

  // Public social/community surfaces
  { name: "telegram config", path: "/api/telegram/config", expect: [200], required: true },
  { name: "telegram status", path: "/api/telegram/status", expect: [200], required: true },
  { name: "telegram rooms", path: "/api/telegram/rooms", expect: [200], required: false },
  { name: "telegram link bot", path: "/api/telegram-link/bot-username", expect: [200, 404, 503], required: false },
  { name: "discord trading status", path: "/api/discord/trading/status", expect: [200, 404, 503], required: false },
  { name: "news health", path: "/api/news/health", expect: [200], required: true },
  { name: "news trending", path: "/api/news/trending", expect: [200, 502, 503], required: false },
  { name: "gallery public", path: "/api/gallery", expect: [200, 503], required: false },

  // Public market/trading reads
  { name: "metaplex health", path: "/api/metaplex-agents/health", expect: [200], required: true },
  { name: "agent explorer status", path: "/api/agent-explorer/status", expect: [200], required: true },
  { name: "helius verify missing wallet", path: "/api/helius/verify-clawd", expect: [400, 422], required: true },
  { name: "staking stats", path: "/api/staking/stats", expect: [200, 503], required: false },
  { name: "clawd stake config", path: "/api/clawd-stake/config", expect: [200], required: true },
  { name: "clawd stake pool", path: "/api/clawd-stake/pool", expect: [200, 502, 503], required: false },
  { name: "meteora status", path: "/api/meteora-swap/status", expect: [200], required: true },
  { name: "meteora pool info", path: "/api/meteora-swap/pool-info", expect: [200, 502, 503], required: false },
  { name: "meteora live price", path: "/api/meteora-swap/live-price", expect: [200, 502, 503], required: false },
  { name: "meteora pool data", path: "/api/meteora-swap/pool-data", expect: [200, 502, 503], required: false },
  { name: "coingecko global", path: "/api/coingecko/global", expect: [200, 502, 503], required: false },
  { name: "coingecko trending", path: "/api/coingecko/trending", expect: [200, 502, 503], required: false },
  { name: "jupiter tokens search", path: "/api/jupiter-tokens/search?query=SOL", expect: [200, 400, 401, 502, 503], required: false },
  { name: "solana tracker health", path: "/api/solana-tracker/health", expect: [200, 502, 503], required: false },
  { name: "birdeye trending", path: "/api/birdeye/trending", expect: [200, 401, 502, 503], required: false },
  { name: "birdeye new listings", path: "/api/birdeye/new-listings?limit=3", expect: [200, 401, 502, 503], required: false },
  { name: "wallet intel summary validation", path: "/api/wallet-intel/summary?wallet=invalid", expect: [400], required: true },
  {
    name: "birdeye perps status",
    path: "/api/birdeye/perps/status",
    expect: [200],
    required: true,
    jsonPathEquals: ["data", "configured", true],
  },
  {
    name: "birdeye perps token list",
    path: "/api/birdeye/perps/token-list?limit=3&sort_by=open_interest&sort_type=desc",
    expect: [200, 401, 502, 503],
    required: false,
  },
  { name: "phoenix markets", path: "/api/phoenix/markets", expect: [200, 502, 503], required: false },
  { name: "imperial status", path: "/api/imperial/status", expect: [200, 502, 503], required: false },
  { name: "dbc fee wallet", path: "/api/dbc/fee-wallet", expect: [200, 502, 503], required: false },
  { name: "free terminal status", path: "/api/free-terminal/status", expect: [200], required: true },
  { name: "gacha status", path: "/api/gacha/status", expect: [200, 503], required: false },
  { name: "pump status", path: "/api/pump/status", expect: [200, 503], required: false },
  { name: "stocks status", path: "/api/stocks/status", expect: [200, 503], required: false },
  { name: "stocks massive asset", path: "/api/stocks/massive/AAPL?range=5D", expect: [200, 502], required: false },
  { name: "moonshot models", path: "/api/moonshot/models", expect: [200], required: true },
  { name: "livekit status", path: "/api/livekit/status", expect: [200, 503], required: false },
  { name: "fal health", path: "/api/fal/health", expect: [200, 503], required: false },
  { name: "nft health", path: "/api/nft/health", expect: [200, 503], required: false },
  { name: "dflow status", path: "/api/dflow/status", expect: [200, 503], required: false },
  { name: "flash status", path: "/api/flash/status", expect: [200], required: true },

  // Protected route gate checks: unauthenticated should not execute.
  { name: "ai gate", path: "/api/ai/welcome", expect: [401, 403], required: true },
  { name: "tokens gate", path: "/api/tokens/launched", expect: [401, 403], required: true },
  { name: "wallet ops gate", path: "/api/wallet-ops/token-search?q=SOL", expect: [401, 403], required: true },
  { name: "developer keys gate", path: "/api/developer/keys", expect: [401, 403], required: true },
  { name: "router keys gate", path: "/api/router-keys", expect: [401, 403], required: true },
  { name: "openrouter gate", path: "/api/openrouter/status", expect: [401, 403], required: true },
  { name: "xai gate", path: "/api/xai/status", expect: [401, 403], required: true },
  { name: "deepseek gate", path: "/api/deepseek/health", expect: [401, 403], required: true },
  { name: "nvidia gate", path: "/api/nvidia/models", expect: [401, 403], required: true },
  { name: "hermes gate", path: "/api/hermes/status", expect: [401, 403], required: true },
  { name: "clawd arena gate", path: "/api/clawd/state", expect: [401, 403], required: true },
  { name: "browser-use gate", path: "/api/browser-use/status", expect: [401, 403], required: true },
  { name: "boxes gate", path: "/api/boxes", expect: [401, 403], required: true },
  { name: "treasury gate", path: "/api/treasury/stats", expect: [401, 403], required: true },
  { name: "holders gate", path: "/api/holders/directory", expect: [401, 403], required: true },
  { name: "portfolio public summary", path: "/api/clawd-portfolio", expect: [200], required: true },
  { name: "agents gate", path: "/api/agents/catalog", expect: [401, 403], required: true },
  { name: "burns gate", path: "/api/burns/user/test-wallet", expect: [401, 403], required: true },
  { name: "clawdrouter gate", path: "/api/clawdrouter/status", expect: [401, 403], required: true },
  { name: "contracts gate", path: "/api/contracts/token-launcher", expect: [401, 403], required: true },
  { name: "crossmint gate", path: "/api/crossmint/wallets/test-wallet/balance", expect: [401, 403], required: true },
  { name: "ipfs gate", path: "/api/ipfs/ipfs", expect: [401, 403], required: true },
  { name: "jupiter prediction gate", path: "/api/jupiter-prediction/trading-status", expect: [401, 403], required: true },
  { name: "jupiter ultra gate", path: "/api/jupiter-ultra/order", expect: [401, 403], required: true },
  { name: "jupiterz gate", path: "/api/jupiterz/transactions/latest", expect: [401, 403], required: true },
  { name: "memes gate", path: "/api/memes/templates", expect: [401, 403], required: true },
  { name: "mint gate", path: "/api/mint/fetch/test-asset", expect: [401, 403], required: true },
  { name: "realtime gate", path: "/api/realtime/status", expect: [401, 403], required: true },
  { name: "streamflow gate", path: "/api/streamflow/locked-balance/summary", expect: [401, 403], required: true },
  { name: "tee public status", path: "/api/tee/status", expect: [200], required: true },
  { name: "user agents gate", path: "/api/user-agents", expect: [401, 403], required: true },
  { name: "voice agent gate", path: "/api/voice-agent/status", expect: [401, 403], required: true },
  { name: "votes gate", path: "/api/votes/test-token", expect: [401, 403], required: true },
  { name: "search gate", path: "/api/search?q=solana", expect: [401, 403], required: true },
  { name: "chat gate", path: "/api/chat/rooms", expect: [401, 403], required: true },
  { name: "imagine gate", path: "/api/imagine/library", expect: [401, 403], required: true },
  { name: "gemini gate", path: "/api/gemini-studio/caches", expect: [401, 403], required: true },
  { name: "voice status gate", path: "/api/voice/status", expect: [401, 403, 404], required: true },
];

async function runTest(test) {
  const url = `${baseUrl}${test.path}`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: test.text ? "text/html,*/*" : "application/json,*/*",
        "User-Agent": "cheshire-smoke/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "manual",
    });
    const elapsed = Date.now() - started;
    const contentType = response.headers.get("content-type") || "";
    const body = test.text ? await response.text() : await response.text();
    const ok = test.expect.includes(response.status);
    const bodyOk = test.textIncludes
      ? body.includes(test.textIncludes)
      : test.text
        ? body.includes("<!DOCTYPE html") || body.includes("<div id=\"root\"")
        : true;
    let jsonOk = true;
    let jsonDetail = "";

    if (test.jsonPathEquals && ok) {
      try {
        const [firstKey, secondKey, expectedValue] = test.jsonPathEquals;
        const json = JSON.parse(body);
        const actualValue = json?.[firstKey]?.[secondKey];
        jsonOk = actualValue === expectedValue;
        if (!jsonOk) {
          jsonDetail = `expected ${firstKey}.${secondKey}=${expectedValue}, got ${actualValue}`;
        }
      } catch (error) {
        jsonOk = false;
        jsonDetail = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      ...test,
      status: response.status,
      elapsed,
      ok: ok && bodyOk && jsonOk,
      detail: ok && bodyOk ? jsonDetail : body.slice(0, 160).replace(/\s+/g, " ").trim(),
      contentType,
    };
  } catch (error) {
    return {
      ...test,
      status: "ERR",
      elapsed: Date.now() - started,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      contentType: "",
    };
  }
}

const results = [];
const concurrency = Number(process.env.SMOKE_CONCURRENCY || 6);
let nextIndex = 0;

async function worker() {
  while (nextIndex < tests.length) {
    const index = nextIndex++;
    const result = await runTest(tests[index]);
    results[index] = result;
    printResult(result);
  }
}

function printResult(r) {
  const marker = r.ok ? "PASS" : r.required ? "FAIL" : "WARN";
  const expected = Array.isArray(r.expect) ? r.expect.join("/") : String(r.expect);
  const suffix = r.ok ? "" : ` :: expected ${expected}; ${r.detail}`;
  console.log(`${marker.padEnd(4)} ${String(r.status).padStart(3)} ${String(r.elapsed).padStart(5)}ms ${r.name} ${r.path}${suffix}`);
}

await Promise.all(
  Array.from({ length: Math.max(1, Math.min(concurrency, tests.length)) }, () => worker()),
);

const requiredFailures = results.filter((r) => r.required && !r.ok);
const optionalFailures = results.filter((r) => !r.required && !r.ok);

console.log("");
console.log(`Smoke base: ${baseUrl}`);
console.log(`Passed: ${results.filter((r) => r.ok).length}/${results.length}`);
console.log(`Required failures: ${requiredFailures.length}`);
console.log(`Optional warnings: ${optionalFailures.length}`);

if (requiredFailures.length > 0) {
  process.exitCode = 1;
}
