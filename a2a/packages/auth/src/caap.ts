import { json, SvmRouter } from "../../runtime/src/router.js";

export const auth = new SvmRouter();

auth.get("/", () => json({
  protocol: "Clawd CAAP",
  status: "available",
  methods: ["SIWS", "NFT-Ownership", "CLAWD-Tier"]
}));

auth.get("/challenge", () => json({
  message: "Sign in with Solana to access SVM-A2A delegated capabilities.",
  nonce: crypto.randomUUID()
}));

auth.post("/verify", async (request) => {
  const body = await request.json().catch(() => ({}));
  return json({
    ok: false,
    status: "verification-not-configured",
    received: Object.keys(body),
    required: ["wallet", "signature", "message"]
  }, { status: 501 });
});

export default auth;
