import https from "https";

const TOKEN = process.env.VERCEL_TOKEN ?? "";
const PROJECT = process.env.VERCEL_PROJECT_ID ?? "";
const TEAM = process.env.VERCEL_TEAM_ID ?? "";
const NEW_KEY = process.env.HELIUS_API_KEY ?? "";
const NEW_URL = process.env.HELIUS_RPC_URL ?? (NEW_KEY ? `https://mainnet.helius-rpc.com/?api-key=${NEW_KEY}` : "");

if (!TOKEN || !PROJECT || !TEAM) {
  throw new Error("Missing Vercel env. Set VERCEL_TOKEN, VERCEL_PROJECT_ID, and VERCEL_TEAM_ID.");
}

if (!NEW_KEY || !NEW_URL) {
  throw new Error("Missing Helius env. Set HELIUS_API_KEY and HELIUS_RPC_URL.");
}

const UPDATES = {
  HELIUS_API_KEY: NEW_KEY,
  HELIUS_RPC_URL: NEW_URL,
  VITE_HELIUS_API_KEY: NEW_KEY,
  VITE_HELIUS_RPC_URL: NEW_URL,
};

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: "api.vercel.com",
      path: `${path}?teamId=${TEAM}`,
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const envs = (await api("GET", `/v9/projects/${PROJECT}/env`)).envs ?? [];
const existing = envs.filter((e) => UPDATES[e.key]);
console.log("Existing Helius vars:", existing.map((e) => `${e.key}(${e.id})`).join(", "));

for (const e of existing) {
  await api("DELETE", `/v9/projects/${PROJECT}/env/${e.id}`);
  console.log(`  ✓ Deleted ${e.key}`);
}

for (const [key, value] of Object.entries(UPDATES)) {
  const r = await api("POST", `/v10/projects/${PROJECT}/env`, {
    key,
    value,
    type: "encrypted",
    target: ["production", "preview", "development"],
  });
  if (r.id) {
    console.log(`  ✓ Created ${key} → id=${r.id}`);
  } else {
    console.error(`  ✗ Failed ${key}:`, JSON.stringify(r).slice(0, 200));
  }
}

console.log("\nAll Helius env vars updated to new key.");
