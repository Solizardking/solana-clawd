#!/usr/bin/env node
/**
 * clawd-gen — CLAWD Agent Generator CLI
 *
 * Generates a unique CLAWD agent with AI-written persona (Grok) and
 * AI-generated portrait (Grok Imagine), then optionally mints it as a
 * Metaplex Core NFT on Solana.
 *
 * Usage:
 *   node scripts/clawd-gen.mjs [options]
 *
 * Options:
 *   --dry-run          Generate + show metadata, skip API calls & mint
 *   --no-image         Skip image generation (save credits)
 *   --no-mint          Skip Solana mint (generate files only)
 *   --no-grok          Skip Grok persona enrichment, use local RNG only
 *   --rpc <url>        Solana RPC endpoint (default: devnet)
 *   --keypair <path>   Path to Solana keypair JSON
 *   --resolution <r>   Image resolution: 1k | 2k (default: 1k)
 *   --character <id>   Seed from an existing character (e.g. "cheshire")
 *
 * Env:
 *   XAI_API_KEY        Required for Grok + image generation
 *   SOLANA_RPC_URL     Override default devnet RPC
 *   KEYPAIR_PATH       Override default keypair path
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createV1, mplCore } from "@metaplex-foundation/mpl-core";
import { generateSigner, keypairIdentity } from "@metaplex-foundation/umi";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { homedir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes, createHash } from "crypto";
import https from "https";
import http from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const AGENTS_DIR = join(ROOT, "agents");
const MINTED_DIR = join(AGENTS_DIR, "minted");
const IMAGES_DIR = join(MINTED_DIR, "images");

// ─── OpenAI-compat client path (xAI uses OpenAI SDK) ─────────────────────────
const OPENAI_PATH = join(ROOT, "library/node_modules/openai/index.mjs");

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined; };

const DRY_RUN    = flag("--dry-run");
const NO_IMAGE   = flag("--no-image") || DRY_RUN;
const NO_MINT    = flag("--no-mint")  || DRY_RUN;
const NO_GROK    = flag("--no-grok")  || DRY_RUN;
const RPC_URL    = getArg("--rpc") || process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const KEYPAIR_PATH = getArg("--keypair") || process.env.KEYPAIR_PATH || join(homedir(), ".config/solana/id.json");
const RESOLUTION = getArg("--resolution") || "1k";
const CHARACTER_SEED = getArg("--character");
const XAI_KEY    = process.env.XAI_API_KEY;

// ─── Randomness pool ──────────────────────────────────────────────────────────

const NAME_PREFIXES = [
  "Neon","Void","Feral","Ghost","Flux","Hex","Nyx","Sol","Echo","Rune",
  "Vex","Rift","Kira","Zeal","Omni","Sable","Psi","Lux","Dusk","Byte",
  "Cipher","Arc","Nova","Fen","Wren","Kael","Zyn","Ori","Thorn","Blaze",
];
const NAME_SUFFIXES = [
  "Clawd","Claw","Paw","Crypt","Node","Byte","Bit","Core","Vault","Wick",
  "Shard","Fang","Lore","Mark","Seal","Gate","Wraith","Pulse","Drift","Trace",
];
const ROLES = [
  "Oracle Keeper","Vault Guardian","Memecoin Shaman","DeFi Strategist",
  "Onchain Sleuth","Perpetuals Phantom","Yield Whisperer","Risk Sentinel",
  "Bridge Wanderer","Alpha Hunter","Governance Delegate","Liquidity Architect",
  "Protocol Auditor","Signal Harvester","Entropy Miner","Execution Ghost",
];
const TRAITS_POOL = [
  "precise","curious","wry","warm","verifiable","on-chain-native","patient",
  "alert","wallet-ready","insightful","volatile","contrarian","nocturnal",
  "stealthy","relentless","playful","calculated","cryptic","stoic","audacious",
  "tenacious","sarcastic","unpredictable","methodical",
];
const SKILL_POOL = [
  "x402-payment-verification","solana-attestation-skill","clawd-perps-agent",
  "meme-executor","risk-portfolio-manager","vulcan-trade-execution",
  "vulcan-ta-strategy","bags-solana-ops","solana-anchor-developer","solana-dev",
  "llama-analyst","community-architect","phantom-wallet-mcp","depin-infrastructure-fetcher",
  "vulcan-technical-analysis","vulcan-market-intel","vulcan-grid-trading",
];
const GREETINGS = [
  "The oracle is live. What do you need?",
  "On-chain and ready. State your intent.",
  "I emerged from the validator. Ask carefully.",
  "Vault open. Skills loaded. Let's trade.",
  "Slot confirmed. I'm listening.",
  "Born from entropy. Ready to earn.",
  "My wallet is warm. What's the play?",
  "I've seen the mempool. You won't surprise me.",
  "Identity attested. Clock ticking. Speak.",
  "Execution-ready. No hesitation.",
];
const AVATAR_EMOJIS = [
  "🦞","🐱","🔮","⛓️","🌑","🌊","🧿","🦅","🐺","🦊",
  "🐉","🤖","👾","🌀","🔥","❄️","🕷️","🦁","🦂","🌙",
];
const VISUAL_STYLES = [
  "glitch-art cyberpunk","neon noir holographic","dark fantasy oil painting",
  "solarpunk digital art","low-poly geometric","watercolor ink wash",
  "vaporwave retrowave","biomechanical horror","abstract expressionist",
  "street art stencil","ukiyo-e woodblock print","retrofuturist space opera",
];
const BG_COLORS = [
  "deep space black","midnight blue","volcanic red","acid green","void purple",
  "toxic teal","rust orange","phantom white","abyssal grey","electric indigo",
];

// ─── Seeded PRNG ───────────────────────────────────────────────────────────────
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
}
function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function pickN(arr, n, rng) { return [...arr].sort(() => rng() - 0.5).slice(0, n); }

// ─── Load character files for seeding ─────────────────────────────────────────
function loadCharacters() {
  const dir = join(AGENTS_DIR, "characters");
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith(".json") && f !== "package.json")
      .map(f => { try { return JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function loadAgentTemplates() {
  const dir = join(AGENTS_DIR, "src");
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .slice(0, 10)
      .map(f => { try { return JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// ─── Random agent generator ───────────────────────────────────────────────────
function generateClawdAgent(seed, characters) {
  const rng = makeRng(seed);

  // Optionally pull adjectives/topics from an existing character for flavor
  let charFlavor = { adjectives: [], topics: [] };
  if (characters.length > 0) {
    const char = characters[Math.floor(rng() * characters.length)];
    charFlavor.adjectives = (char.adjectives || []).slice(0, 3);
    charFlavor.topics = (char.topics || []).slice(0, 4);
  }

  const prefix = pick(NAME_PREFIXES, rng);
  const suffix = pick(NAME_SUFFIXES, rng);
  const name = `${prefix}${suffix}`;
  const avatar = pick(AVATAR_EMOJIS, rng);
  const displayName = `${avatar} ${name}`;
  const role = pick(ROLES, rng);
  const traits = [...new Set([...charFlavor.adjectives, ...pickN(TRAITS_POOL, 4, rng)])].slice(0, 6);
  const skills = pickN(SKILL_POOL, 3 + Math.floor(rng() * 3), rng);
  const greeting = pick(GREETINGS, rng);
  const genNumber = 1 + Math.floor(rng() * 9999);
  const visualStyle = pick(VISUAL_STYLES, rng);
  const bgColor = pick(BG_COLORS, rng);

  const rarityRoll = rng();
  const rarity = rarityRoll < 0.55 ? "Common"
    : rarityRoll < 0.80 ? "Uncommon"
    : rarityRoll < 0.95 ? "Rare"
    : rarityRoll < 0.99 ? "Epic"
    : "Legendary";

  const topics = [...new Set([...charFlavor.topics, "Solana", "DeFi", "on-chain AI"])].slice(0, 6);

  return { name, displayName, avatar, role, traits, skills, greeting, genNumber, rarity, visualStyle, bgColor, topics };
}

// ─── Build image prompt ───────────────────────────────────────────────────────
function buildImagePrompt(agent) {
  return `${agent.visualStyle} portrait of an AI crypto agent named "${agent.name}". \
Role: ${agent.role}. Personality: ${agent.traits.slice(0,3).join(", ")}. \
Background: ${agent.bgColor}. \
The agent has a feline/lobster hybrid digital presence — mysterious, powerful, on-chain. \
Mood: ${agent.rarity === "Legendary" ? "godlike and overwhelming" : agent.rarity === "Epic" ? "intense and dramatic" : "sharp and focused"}. \
Include subtle Solana blockchain imagery: validators, chains, glyph-like symbols. \
High quality, detailed, dramatic lighting. No text overlays.`;
}

// ─── xAI API helpers ──────────────────────────────────────────────────────────
async function grokEnrichPersona(agent) {
  const { default: OpenAI } = await import(OPENAI_PATH);
  const client = new OpenAI({ apiKey: XAI_KEY, baseURL: "https://api.x.ai/v1" });

  const prompt = `You are the CLAWD Genesis Oracle. Write a short, punchy agent bio (2 sentences max) and 3 lore facts for this AI agent:
Name: ${agent.name}
Role: ${agent.role}
Traits: ${agent.traits.join(", ")}
Primary Skill: ${agent.skills[0]}
Rarity: ${agent.rarity}

Respond ONLY with JSON: {"bio": "...", "lore": ["...", "...", "..."]}
Keep each lore fact under 15 words. Tone: dark, cryptic, Solana-native.`;

  const response = await client.chat.completions.create({
    model: "grok-3-fast",
    messages: [{ role: "user", content: prompt }],
    temperature: 1.0,
    max_tokens: 200,
  });

  const text = response.choices[0]?.message?.content?.trim() || "{}";
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { bio: `${agent.name} operates in the shadows of the validator network.`, lore: [] };
  }
}

async function generateAgentImage(agent) {
  const { default: OpenAI } = await import(OPENAI_PATH);
  const client = new OpenAI({ apiKey: XAI_KEY, baseURL: "https://api.x.ai/v1" });

  const imagePrompt = buildImagePrompt(agent);
  console.log(`  Generating image (${RESOLUTION})...`);

  const response = await client.images.generate({
    model: "grok-imagine-image-quality",
    prompt: imagePrompt,
    response_format: "b64_json",
    ...(RESOLUTION !== "1k" && { resolution: RESOLUTION }),
  });

  const b64 = response.data[0]?.b64_json;
  if (!b64) throw new Error("No image data returned from xAI");
  return b64;
}

// ─── Download image from URL ──────────────────────────────────────────────────
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ─── Build Metaplex metadata ──────────────────────────────────────────────────
function buildMetadata(agent, enrichment, mintAddress, mintedAt, imageUri) {
  const bio = enrichment?.bio || `${agent.displayName} — a ${agent.rarity} ${agent.role} from the OpenClawd registry.`;
  const lore = enrichment?.lore || [];

  return {
    name: agent.displayName,
    symbol: "CLAWD",
    description: bio,
    image: imageUri,
    external_url: "https://x402.wtf",
    attributes: [
      { trait_type: "Role",         value: agent.role },
      { trait_type: "Rarity",       value: agent.rarity },
      { trait_type: "Generation",   value: String(agent.genNumber) },
      { trait_type: "Traits",       value: agent.traits.join(", ") },
      { trait_type: "Primary Skill",value: agent.skills[0] },
      { trait_type: "Visual Style", value: agent.visualStyle },
      { trait_type: "Ecosystem",    value: "OpenClawd" },
      { trait_type: "Registry",     value: "8004" },
      { trait_type: "Minted At",    value: mintedAt },
    ],
    properties: {
      files: [{ uri: imageUri, type: "image/jpeg" }],
      category: "agent",
    },
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
        bio,
        lore,
        topics: agent.topics,
      },
      skills: agent.skills.map((s, i) => ({
        name: s,
        enabled: true,
        priority: i === 0 ? "primary" : "secondary",
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadKeypairBytes() {
  const p = KEYPAIR_PATH.startsWith("~") ? join(homedir(), KEYPAIR_PATH.slice(1)) : KEYPAIR_PATH;
  if (!existsSync(p)) throw new Error(`Keypair not found: ${p}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

function ensureDirs() {
  [MINTED_DIR, IMAGES_DIR].forEach(d => { try { mkdirSync(d, { recursive: true }); } catch {} });
}

// ─── Pretty print ─────────────────────────────────────────────────────────────
function printBox(agent) {
  const RARITIES = { Legendary: "⭐⭐⭐⭐⭐", Epic: "⭐⭐⭐⭐", Rare: "⭐⭐⭐", Uncommon: "⭐⭐", Common: "⭐" };
  console.log("\n┌─────────────────────────────────────────┐");
  console.log(` ${agent.displayName.padEnd(43)}`);
  console.log(`├─────────────────────────────────────────┤`);
  console.log(` Role:    ${agent.role}`);
  console.log(` Rarity:  ${RARITIES[agent.rarity] || ""} ${agent.rarity}  (Gen #${agent.genNumber})`);
  console.log(` Traits:  ${agent.traits.join(", ")}`);
  console.log(` Skills:  ${agent.skills.slice(0,2).join(", ")}`);
  console.log(`          ${agent.skills.slice(2).join(", ")}`);
  console.log(` Style:   ${agent.visualStyle}`);
  console.log(` Greeting: "${agent.greeting}"`);
  console.log("└─────────────────────────────────────────┘\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  ensureDirs();

  // Derive seed
  const tsBytes = Buffer.alloc(4);
  tsBytes.writeUInt32BE((Date.now() / 1000) >>> 0);
  const randBuf = randomBytes(4);
  const seed = tsBytes.readUInt32BE(0) ^ randBuf.readUInt32BE(0);
  const seedHex = (seed >>> 0).toString(16).padStart(8, "0");

  const characters = loadCharacters();
  const agent = generateClawdAgent(seed, characters);

  printBox(agent);

  if (DRY_RUN) {
    console.log("[dry-run] No API calls made.");
    console.log("[dry-run] Image prompt would be:");
    console.log(" ", buildImagePrompt(agent));
    return;
  }

  if (!XAI_KEY && (!NO_GROK || !NO_IMAGE)) {
    console.warn("⚠  XAI_API_KEY not set — skipping Grok enrichment and image generation.");
    console.warn("   Set XAI_API_KEY to enable AI persona + portrait generation.\n");
  }

  // ── Grok persona enrichment ──────────────────────────────────────────────
  let enrichment = null;
  if (!NO_GROK && XAI_KEY) {
    process.stdout.write("  Enriching persona via Grok...");
    try {
      enrichment = await grokEnrichPersona(agent);
      console.log(" done.");
      if (enrichment.bio) console.log(`  Bio: ${enrichment.bio}`);
      if (enrichment.lore?.length) enrichment.lore.forEach(l => console.log(`  • ${l}`));
    } catch (e) {
      console.log(` failed (${e.message}) — using local generation.`);
    }
  }

  // ── Image generation ────────────────────────────────────────────────────
  let imageUri = "https://gateway.pinata.cloud/ipfs/bafybeignhsy4fvwc6smk7d5fgjwmsa5ngzd5osgvvxv7ka6lgejlhzkdly";
  let imagePath = null;

  if (!NO_IMAGE && XAI_KEY) {
    try {
      const b64 = await generateAgentImage(agent);
      const imgBuf = Buffer.from(b64, "base64");
      const slug = agent.name.toLowerCase();
      imagePath = join(IMAGES_DIR, `${slug}-${seedHex}.jpg`);
      writeFileSync(imagePath, imgBuf);
      console.log(`  Image saved: ${imagePath}`);
      // Use a relative URI — users can pin to IPFS/Pinata separately
      imageUri = `agents/minted/images/${slug}-${seedHex}.jpg`;
    } catch (e) {
      console.warn(`  Image generation failed: ${e.message} — using default image.`);
    }
  }

  // ── Build + save metadata ───────────────────────────────────────────────
  const mintedAt = new Date().toISOString();
  const slug = agent.name.toLowerCase();
  const metadataPath = join(MINTED_DIR, `${slug}-${seedHex}.json`);
  const metadata = buildMetadata(agent, enrichment, null, mintedAt, imageUri);
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`  Metadata: ${metadataPath}\n`);

  // ── Solana mint ─────────────────────────────────────────────────────────
  if (NO_MINT) {
    console.log("[--no-mint] Skipping Solana mint.");
    return;
  }

  const umi = createUmi(RPC_URL).use(mplCore());
  const keypairBytes = loadKeypairBytes();
  const keypair = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(keypairBytes));
  umi.use(keypairIdentity(keypair));

  const assetSigner = generateSigner(umi);
  const mintAddress = assetSigner.publicKey.toString();

  console.log(`  Asset:   ${mintAddress}`);
  console.log(`  Network: ${RPC_URL}`);
  process.stdout.write("  Minting...");

  const { signature } = await createV1(umi, {
    asset: assetSigner,
    name: agent.displayName,
    uri: `https://x402.wtf/agents/minted/${slug}-${seedHex}.json`,
  }).sendAndConfirm(umi);

  const txSig = Buffer.from(signature).toString("base64");
  console.log(" confirmed!\n");

  // Update proof
  metadata.openclawd.proofOfExecution.assetAddress = mintAddress;
  metadata.openclawd.proofOfExecution.txSignature = txSig;
  metadata.openclawd.proofOfExecution.verified = true;
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  const cluster = RPC_URL.includes("mainnet") ? "" : "?cluster=devnet";
  console.log(`┌─────────────────────────────────────────┐`);
  console.log(` ${agent.displayName} lives onchain.`);
  console.log(` Asset:  ${mintAddress}`);
  console.log(` Tx:     ${txSig.slice(0, 24)}...`);
  console.log(` Explorer: https://explorer.solana.com/address/${mintAddress}${cluster}`);
  console.log(`└─────────────────────────────────────────┘\n`);
}

main().catch(e => { console.error("\nFailed:", e.message || e); process.exit(1); });
