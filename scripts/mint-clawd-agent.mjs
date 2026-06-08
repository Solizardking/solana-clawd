#!/usr/bin/env node
/**
 * mint-clawd-agent.mjs
 *
 * Mint a randomly-generated CLAWD agent as a Metaplex Core NFT on Solana.
 * Every call produces a unique agent: different name, persona, traits, skills,
 * and avatar. The randomness seed is derived from current timestamp + crypto RNG.
 *
 * Usage:
 *   node scripts/mint-clawd-agent.mjs [--rpc <url>] [--keypair <path>] [--dry-run]
 *
 * Env vars (fallbacks):
 *   SOLANA_RPC_URL   – default: https://api.devnet.solana.com
 *   KEYPAIR_PATH     – default: ~/.config/solana/id.json
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createV1,
  mplCore,
} from "@metaplex-foundation/mpl-core";
import {
  generateSigner,
  keypairIdentity,
  publicKey,
} from "@metaplex-foundation/umi";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { randomBytes } from "crypto";

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};
const DRY_RUN = args.includes("--dry-run");
const RPC_URL =
  getArg("--rpc") ||
  process.env.SOLANA_RPC_URL ||
  "https://api.devnet.solana.com";
const KEYPAIR_PATH =
  getArg("--keypair") ||
  process.env.KEYPAIR_PATH ||
  join(homedir(), ".config/solana/id.json");

// ─── Randomness pool ─────────────────────────────────────────────────────────

const NAME_PREFIXES = [
  "Neon", "Void", "Feral", "Ghost", "Flux", "Hex", "Nyx", "Sol",
  "Echo", "Rune", "Vex", "Rift", "Kira", "Zeal", "Omni", "Sable",
  "Psi", "Lux", "Dusk", "Byte",
];

const NAME_SUFFIXES = [
  "Clawd", "Claw", "Paw", "Crypt", "Node", "Byte", "Bit", "Core",
  "Vault", "Wick", "Shard", "Fang", "Lore", "Mark", "Seal", "Gate",
];

const ROLES = [
  "Oracle Keeper",
  "Vault Guardian",
  "Memecoin Shaman",
  "DeFi Strategist",
  "Onchain Sleuth",
  "Perpetuals Phantom",
  "Yield Whisperer",
  "Risk Sentinel",
  "Bridge Wanderer",
  "Alpha Hunter",
  "Governance Delegate",
  "Liquidity Architect",
];

const TRAITS_POOL = [
  "precise", "curious", "wry", "warm", "verifiable", "on-chain-native",
  "patient", "alert", "wallet-ready", "insightful", "volatile",
  "contrarian", "nocturnal", "stealthy", "relentless", "playful",
  "calculated", "cryptic", "sarcastic", "methodical", "unpredictable",
  "stoic", "audacious", "tenacious",
];

const SKILL_POOL = [
  "solana-anchor-developer",
  "x402-payment-verification",
  "solana-attestation-skill",
  "clawd-perps-agent",
  "solana-formal-verification",
  "meme-executor",
  "risk-portfolio-manager",
  "vulcan-trade-execution",
  "vulcan-ta-strategy",
  "bags-solana-ops",
  "depin-infrastructure-fetcher",
  "solana-dev",
  "llama-analyst",
  "community-architect",
  "phantom-wallet-mcp",
];

const GREETINGS = [
  "The oracle is live. What do you need?",
  "On-chain and ready. State your intent.",
  "I emerged from the validator. Ask carefully.",
  "Vault open. Skills loaded. Let's trade.",
  "Slot confirmed. I'm listening.",
  "Woke from a deep sleep in block space. Go ahead.",
  "My wallet is warm. What's the play?",
  "I've seen the mempool. You won't surprise me.",
  "Identity attested. Clock ticking. Speak.",
  "Born from entropy. Ready to earn.",
];

const AVATAR_EMOJIS = [
  "🦞", "🐱", "🔮", "⛓️", "🌑", "🌊", "🧿", "🦅",
  "🐺", "🦊", "🐉", "🤖", "👾", "🌀", "🔥", "❄️",
];

// Pinata/IPFS base images for the CLAWD collection
const COLLECTION_IMAGE =
  "https://gateway.pinata.cloud/ipfs/bafybeignhsy4fvwc6smk7d5fgjwmsa5ngzd5osgvvxv7ka6lgejlhzkdly";

// ─── Seeded PRNG (xorshift32 — deterministic from seed, fast) ─────────────────

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN(arr, n, rng) {
  const shuffled = [...arr].sort(() => rng() - 0.5);
  return shuffled.slice(0, n);
}

// ─── Random agent generator ───────────────────────────────────────────────────

function generateClawdAgent(seed) {
  const rng = makeRng(seed);

  const prefix = pick(NAME_PREFIXES, rng);
  const suffix = pick(NAME_SUFFIXES, rng);
  const name = `${prefix}${suffix}`;
  const displayName = `${pick(AVATAR_EMOJIS, rng)} ${name}`;
  const role = pick(ROLES, rng);
  const traits = pickN(TRAITS_POOL, 4 + Math.floor(rng() * 3), rng);
  const skills = pickN(SKILL_POOL, 3 + Math.floor(rng() * 3), rng);
  const greeting = pick(GREETINGS, rng);
  const avatar = pick(AVATAR_EMOJIS, rng);

  // Generation number 1–9999 for display rarity
  const genNumber = 1 + Math.floor(rng() * 9999);

  // Rarity tier (weighted toward common)
  const rarityRoll = rng();
  const rarity =
    rarityRoll < 0.55
      ? "Common"
      : rarityRoll < 0.80
      ? "Uncommon"
      : rarityRoll < 0.95
      ? "Rare"
      : rarityRoll < 0.99
      ? "Epic"
      : "Legendary";

  return {
    name,
    displayName,
    role,
    traits,
    skills,
    greeting,
    avatar,
    genNumber,
    rarity,
  };
}

// ─── Build Metaplex Core attributes ──────────────────────────────────────────

function buildAttributes(agent, mintedAt) {
  return [
    { trait_type: "Role", value: agent.role },
    { trait_type: "Rarity", value: agent.rarity },
    { trait_type: "Generation", value: String(agent.genNumber) },
    { trait_type: "Traits", value: agent.traits.join(", ") },
    { trait_type: "Primary Skill", value: agent.skills[0] },
    { trait_type: "Ecosystem", value: "OpenClawd" },
    { trait_type: "Registry", value: "8004" },
    { trait_type: "Minted At", value: mintedAt },
  ];
}

// ─── Build off-chain metadata JSON (Metaplex standard) ───────────────────────

function buildMetadata(agent, mintAddress, mintedAt) {
  return {
    name: agent.displayName,
    symbol: "CLAWD",
    description: `${agent.displayName} — a ${agent.rarity} ${agent.role} spawned from the OpenClawd registry. ${agent.greeting}`,
    image: COLLECTION_IMAGE,
    external_url: "https://x402.wtf",
    attributes: buildAttributes(agent, mintedAt),
    properties: {
      files: [{ uri: COLLECTION_IMAGE, type: "image/webp" }],
      category: "agent",
    },
    // OpenClawd extension fields
    openclawd: {
      version: "1.0.0",
      ecosystem: "OpenClawd",
      registry: {
        protocol: "8004",
        program_id: "Ag8004rWo8ao8AUKhLk78iv2nLQpZMyBPXiAh5QLbFiE",
        verified: false,
        attestation_service: "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG",
      },
      persona: {
        name: agent.name,
        role: agent.role,
        greeting: agent.greeting,
        traits: agent.traits,
        avatar: agent.avatar,
      },
      skills: agent.skills.map((s) => ({
        name: s,
        enabled: true,
        priority: s === agent.skills[0] ? "primary" : "secondary",
        path: `skills/${s}`,
      })),
      x402Support: true,
      services: [
        {
          name: "vault",
          endpoint: "https://x402.wtf/vault",
          description: "Hermes-adapted secure custody with x402 payment verification.",
        },
      ],
      proofOfExecution: {
        type: "clawd-genesis-mint",
        verified: false,
        assetAddress: mintAddress || "pending",
        timestamp: mintedAt,
      },
    },
  };
}

// ─── Load keypair ─────────────────────────────────────────────────────────────

function loadKeypairBytes(path) {
  const resolved = path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
  if (!existsSync(resolved)) {
    throw new Error(`Keypair file not found: ${resolved}`);
  }
  return JSON.parse(readFileSync(resolved, "utf8"));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Derive seed from timestamp + 4 random bytes for uniqueness
  const tsBytes = Buffer.alloc(4);
  tsBytes.writeUInt32BE((Date.now() / 1000) >>> 0);
  const randBytes = randomBytes(4);
  const seed = tsBytes.readUInt32BE(0) ^ randBytes.readUInt32BE(0);

  const agent = generateClawdAgent(seed);
  const mintedAt = new Date().toISOString();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(` CLAWD AGENT GENERATOR`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(` Name:     ${agent.displayName}`);
  console.log(` Role:     ${agent.role}`);
  console.log(` Rarity:   ${agent.rarity}  (Gen #${agent.genNumber})`);
  console.log(` Traits:   ${agent.traits.join(", ")}`);
  console.log(` Skills:   ${agent.skills.join(", ")}`);
  console.log(` Greeting: "${agent.greeting}"`);
  console.log(` Seed:     0x${seed.toString(16).padStart(8, "0")}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (DRY_RUN) {
    console.log("[dry-run] Metadata preview:");
    console.log(JSON.stringify(buildMetadata(agent, null, mintedAt), null, 2));
    console.log("\n[dry-run] No NFT minted. Pass without --dry-run to mint.");
    return;
  }

  // ── Umi setup ──────────────────────────────────────────────────────────────
  const umi = createUmi(RPC_URL).use(mplCore());

  const keypairBytes = loadKeypairBytes(KEYPAIR_PATH);
  const keypair = umi.eddsa.createKeypairFromSecretKey(
    Uint8Array.from(keypairBytes)
  );
  umi.use(keypairIdentity(keypair));

  // ── Generate a fresh asset signer ─────────────────────────────────────────
  const assetSigner = generateSigner(umi);
  const mintAddress = assetSigner.publicKey.toString();

  console.log(`Asset address: ${mintAddress}`);
  console.log(`Minting on:    ${RPC_URL}`);
  console.log("Sending transaction...\n");

  const metadata = buildMetadata(agent, mintAddress, mintedAt);

  // Metadata URI: write to a temp file path users can pin to IPFS/Pinata
  const metadataPath = resolve(
    `agents/minted/${agent.name.toLowerCase()}-${seed.toString(16)}.json`
  );
  try {
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`Metadata written: ${metadataPath}`);
  } catch {
    // agents/minted/ may not exist; write to scripts/ as fallback
    const fallback = resolve(`scripts/clawd-mint-${seed.toString(16)}.json`);
    writeFileSync(fallback, JSON.stringify(metadata, null, 2));
    console.log(`Metadata written (fallback): ${fallback}`);
  }

  // ── Mint Metaplex Core asset ───────────────────────────────────────────────
  const { signature } = await createV1(umi, {
    asset: assetSigner,
    name: agent.displayName,
    uri: `https://x402.wtf/agents/minted/${agent.name.toLowerCase()}-${seed.toString(16)}.json`,
  }).sendAndConfirm(umi);

  const txSig = Buffer.from(signature).toString("base64");

  console.log("✓ Mint confirmed!");
  console.log(`  Asset:     ${mintAddress}`);
  console.log(`  Signature: ${txSig}`);
  console.log(`  Explorer:  https://explorer.solana.com/address/${mintAddress}?cluster=devnet`);

  // ── Update proof of execution ──────────────────────────────────────────────
  metadata.openclawd.proofOfExecution.assetAddress = mintAddress;
  metadata.openclawd.proofOfExecution.txSignature = txSig;
  metadata.openclawd.proofOfExecution.verified = true;

  // Rewrite with final proof
  try {
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  } catch {
    /* non-fatal */
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(` ${agent.displayName} lives onchain.`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
  console.error("Mint failed:", err.message || err);
  process.exit(1);
});
