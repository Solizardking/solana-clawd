import { Hono } from "hono";

export const auth = new Hono();

auth.get("/", (c) => c.json({
  protocol: "Clawd CAAP",
  status: "available",
  methods: ["SIWS", "NFT-Ownership", "CLAWD-Tier"]
}));

auth.get("/challenge", (c) => c.json({
  message: "Sign in with Solana to access SVM-A2A delegated capabilities.",
  nonce: crypto.randomUUID()
}));

auth.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({
    ok: false,
    status: "verification-not-configured",
    received: Object.keys(body),
    required: ["wallet", "signature", "message"]
  }, 501);
});

export default auth;
