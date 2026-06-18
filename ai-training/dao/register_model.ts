/**
 * Clawd Model Registration
 *
 * Registers a Clawd model into the solana_ai_inference Anchor program
 * (program ID: 3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj) on devnet/mainnet.
 *
 * This is the onchain "initialize_model" instruction — it creates a ModelRegistry
 * PDA seeded by ["model", authority] that anchors the model's HF hash, API endpoint,
 * and reward rate to your wallet permanently.
 *
 * Usage:
 *   pnpm tsx dao/register_model.ts \
 *     --model-hash "sha256:abc123..." \
 *     --endpoint "https://clawd-box-router.fly.dev/v1" \
 *     --keypair ~/.config/solana/id.json
 *
 * Or via the one-shot shell wrapper: dao/register_model.sh
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

// ── Constants ──────────────────────────────────────────────────────────────

const PROGRAM_ID = new web3.PublicKey("3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj");
const IDL_PATH = path.resolve(__dirname, "../../../OnChain-Ai-main/solana-ai-inference/target/idl/solana_ai_inference.json");

// Clawd model registry at onchain.x402.wtf
const ONCHAIN_REGISTRY_API = process.env.ONCHAIN_REGISTRY_URL ?? "https://onchain.x402.wtf/api/register";

interface RegisterArgs {
  modelHash: string;       // sha256 or HF commit hash
  modelType: string;       // "TextGeneration" | "SentimentAnalysis" | ...
  apiEndpoint: string;     // ClawdRouter or HF inference endpoint
  termRewardRate: number;  // $CLAWD lamports per validated inference (u64)
  keypairPath: string;
  cluster: "devnet" | "mainnet-beta";
  dryRun: boolean;
}

// ── Program type (inline — matches IDL) ───────────────────────────────────

const MODEL_TYPE_MAP: Record<string, object> = {
  TextGeneration:         { textGeneration: {} },
  SentimentAnalysis:      { sentimentAnalysis: {} },
  ImageClassification:    { imageClassification: {} },
  PricePrediction:        { pricePrediction: {} },
  DocumentUnderstanding:  { documentUnderstanding: {} },
};

async function registerModel(args: RegisterArgs): Promise<string> {
  // Load keypair
  const keypairJson = JSON.parse(fs.readFileSync(args.keypairPath, "utf-8"));
  const authority = web3.Keypair.fromSecretKey(Uint8Array.from(keypairJson));

  // Provider
  const rpcUrl =
    args.cluster === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com";
  const connection = new web3.Connection(rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(authority);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  // Load IDL
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const program = new Program(idl, PROGRAM_ID, provider);

  // Derive model registry PDA: seeds = ["model", authority.pubkey]
  const [modelRegistryPDA] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("model"), authority.publicKey.toBuffer()],
    PROGRAM_ID
  );

  const modelType = MODEL_TYPE_MAP[args.modelType];
  if (!modelType) {
    throw new Error(`Unknown model type: ${args.modelType}. Valid: ${Object.keys(MODEL_TYPE_MAP).join(", ")}`);
  }

  console.log(`\nRegistering model on ${args.cluster}:`);
  console.log(`  Authority:   ${authority.publicKey.toBase58()}`);
  console.log(`  Registry PDA: ${modelRegistryPDA.toBase58()}`);
  console.log(`  Model hash:  ${args.modelHash}`);
  console.log(`  Type:        ${args.modelType}`);
  console.log(`  Endpoint:    ${args.apiEndpoint}`);

  if (args.dryRun) {
    console.log("\n[DRY RUN] Transaction not submitted.");
    return modelRegistryPDA.toBase58();
  }

  // Submit initialize_model instruction
  const txSig = await (program.methods as any)
    .initializeModel(
      args.modelHash,
      modelType,
      args.apiEndpoint,
      new BN(args.termRewardRate)
    )
    .accounts({
      modelRegistry: modelRegistryPDA,
      authority: authority.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  console.log(`\nTransaction confirmed: ${txSig}`);
  console.log(`Explorer: https://solscan.io/tx/${txSig}?cluster=${args.cluster}`);
  console.log(`Registry PDA: ${modelRegistryPDA.toBase58()}`);

  // Also register with the onchain.x402.wtf off-chain index
  try {
    const regResp = await fetch(ONCHAIN_REGISTRY_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model_hash: args.modelHash,
        model_type: args.modelType,
        api_endpoint: args.apiEndpoint,
        authority: authority.publicKey.toBase58(),
        pda: modelRegistryPDA.toBase58(),
        tx_sig: txSig,
        cluster: args.cluster,
        hf_model_id: process.env.HF_MODEL_ID ?? "",
        dataset_size: parseInt(process.env.DATASET_SIZE ?? "36109"),
        eval_accuracy: parseFloat(process.env.EVAL_ACCURACY ?? "0.60"),
      }),
    });
    if (regResp.ok) {
      const body = await regResp.json();
      console.log(`\nOnchain registry updated: ${JSON.stringify(body)}`);
    }
  } catch (e) {
    console.warn(`[registry warn] Could not reach ${ONCHAIN_REGISTRY_API}: ${e}`);
  }

  return txSig;
}

// ── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(): RegisterArgs {
  const argv = process.argv.slice(2);
  const get = (flag: string, def?: string): string => {
    const idx = argv.indexOf(flag);
    if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
    if (def !== undefined) return def;
    throw new Error(`Missing required flag: ${flag}`);
  };
  return {
    modelHash:       get("--model-hash", "sha256:pending"),
    modelType:       get("--model-type", "TextGeneration"),
    apiEndpoint:     get("--endpoint",   "https://clawd-box-router.fly.dev/v1"),
    termRewardRate:  parseInt(get("--reward-rate", "1000000")),
    keypairPath:     get("--keypair",    process.env.HOME + "/.config/solana/id.json"),
    cluster:         (get("--cluster", "devnet") as "devnet" | "mainnet-beta"),
    dryRun:          argv.includes("--dry-run"),
  };
}

(async () => {
  try {
    const args = parseArgs();
    await registerModel(args);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
