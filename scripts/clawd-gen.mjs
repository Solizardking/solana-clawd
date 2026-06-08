#!/usr/bin/env node
/**
 * clawd-gen — CLAWD Agent Generator CLI
 *
 * Zero-config by default: tries the x402.wtf gateway first.
 * The gateway uses project-side XAI_API_KEY + FEE_PAYER for image gen and gasless mints.
 * CLAWD holders ($CLAWD ≥ 1000) get the mint covered by the project automatically.
 *
 * Falls back to local generation if no gateway / gateway offline.
 *
 * Usage:
 *   node scripts/clawd-gen.mjs [options]
 *
 * Options:
 *   --dry-run          Print what would happen, skip all API calls
 *   --no-image         Skip image generation
 *   --no-mint          Skip Solana mint (files only)
 *   --no-grok          Skip Grok persona enrichment
 *   --local            Bypass gateway entirely, use local keys
 *   --rpc <url>        Solana RPC (default: devnet for local mode)
 *   --keypair <path>   Solana keypair JSON path
 *   --resolution <r>   1k | 2k (default: 1k)
 *   --gateway <url>    Override gateway URL (default: https://x402.wtf)
 *
 * Env (only needed in --local mode):
 *   XAI_API_KEY        xAI key for Grok + image gen
 *   HELIUS_RPC_URL     Preferred full Helius RPC URL
 *   HELIUS_API_KEY     Used to derive Helius RPC when HELIUS_RPC_URL is unset
 *   SOLANA_RPC_URL     Override fallback RPC
 *   KEYPAIR_PATH       Override keypair path
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");
const AGENTS_DIR = join(ROOT, "agents");
const MINTED_DIR = join(AGENTS_DIR, "minted");
const IMAGES_DIR = join(MINTED_DIR, "images");
const OPENAI_PATH = join(ROOT, "library/node_modules/openai/index.mjs");

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag   = (f) => args.includes(f);
const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined; };

const DRY_RUN    = flag("--dry-run");
const NO_IMAGE   = flag("--no-image") || DRY_RUN;
const NO_MINT    = flag("--no-mint")  || DRY_RUN;
const NO_GROK    = flag("--no-grok")  || DRY_RUN;
const LOCAL_MODE = flag("--local");
const DEFAULT_HELIUS_RPC =
  process.env.HELIUS_RPC_URL ||
  (process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : "https://api.mainnet-beta.solana.com");
const RPC_URL    = getArg("--rpc") || DEFAULT_HELIUS_RPC || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const KEYPAIR_PATH = getArg("--keypair") || process.env.KEYPAIR_PATH || join(homedir(), ".config/solana/id.json");
const RESOLUTION = getArg("--resolution") || "1k";
const GATEWAY    = getArg("--gateway") || "https://x402.wtf";
const XAI_KEY    = process.env.XAI_API_KEY;

// ─── Random pools ─────────────────────────────────────────────────────────────
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

// ─── PRNG ─────────────────────────────────────────────────────────────────────
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
}
function pick(arr, rng)    { return arr[Math.floor(rng() * arr.length)]; }
function pickN(arr, n, rng){ return [...arr].sort(() => rng() - 0.5).slice(0, n); }

// ─── Character loader ─────────────────────────────────────────────────────────
function loadCharacters() {
  const dir = join(AGENTS_DIR, "characters");
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith(".json") && f !== "package.json")
      .map(f => { try { return JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// ─── Local keypair pubkey ─────────────────────────────────────────────────────
function getLocalPubkey() {
  try {
    const path = KEYPAIR_PATH.startsWith("~") ? join(homedir(), KEYPAIR_PATH.slice(1)) : KEYPAIR_PATH;
    if (!existsSync(path)) return null;
    const { default: OpenAI, ..._ } = { default: null }; // avoid import just for pubkey
    // Use @solana/web3.js Keypair if available, else decode manually
    const bytes = JSON.parse(readFileSync(path, "utf8"));
    // last 32 bytes = public key in standard Solana keypair format
    const pubBytes = Uint8Array.from(bytes).slice(32);
    return encodeBase58(pubBytes);
  } catch { return null; }
}

// Minimal base58 encoder for pubkey display (no dep needed)
const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(bytes) {
  let n = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let result = "";
  while (n > 0n) { result = BASE58_CHARS[Number(n % 58n)] + result; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; result = "1" + result; }
  return result;
}

// ─── Local agent generator ────────────────────────────────────────────────────
function generateLocalAgent(seed, characters) {
  const rng = makeRng(seed);
  let charFlavor = { adjectives: [], topics: [] };
  if (characters.length > 0) {
    const char = characters[Math.floor(rng() * characters.length)];
    charFlavor.adjectives = (char.adjectives || []).slice(0, 3);
    charFlavor.topics     = (char.topics     || []).slice(0, 4);
  }
  const prefix = pick(NAME_PREFIXES, rng);
  const suffix = pick(NAME_SUFFIXES, rng);
  const name   = `${prefix}${suffix}`;
  const avatar = pick(AVATAR_EMOJIS, rng);
  const role   = pick(ROLES, rng);
  const traits = [...new Set([...charFlavor.adjectives, ...pickN(TRAITS_POOL, 4, rng)])].slice(0, 6);
  const skills = pickN(SKILL_POOL, 3 + Math.floor(rng() * 3), rng);
  const greeting     = pick(GREETINGS, rng);
  const genNumber    = 1 + Math.floor(rng() * 9999);
  const visualStyle  = pick(VISUAL_STYLES, rng);
  const bgColor      = pick(BG_COLORS, rng);
  const topics       = [...new Set([...charFlavor.topics, "Solana", "DeFi", "on-chain AI"])].slice(0, 6);
  const r = rng();
  const rarity = r < 0.55 ? "Common" : r < 0.80 ? "Uncommon" : r < 0.95 ? "Rare" : r < 0.99 ? "Epic" : "Legendary";
  return { name, displayName: `${avatar} ${name}`, avatar, role, traits, skills, greeting, genNumber, rarity, visualStyle, bgColor, topics };
}

function buildImagePrompt(agent) {
  return `${agent.visualStyle} portrait of an AI crypto agent named "${agent.name}". ` +
    `Role: ${agent.role}. Personality: ${agent.traits.slice(0,3).join(", ")}. ` +
    `Background: ${agent.bgColor}. ` +
    `Feline/lobster hybrid digital presence — mysterious, powerful, on-chain. ` +
    `Mood: ${agent.rarity === "Legendary" ? "godlike" : agent.rarity === "Epic" ? "intense" : "sharp"}. ` +
    `Subtle Solana blockchain imagery: validators, glyphs, chains. Dramatic lighting. No text overlays.`;
}

// ─── Gateway call ─────────────────────────────────────────────────────────────
async function callGateway(pubkey, seed) {
  const body = JSON.stringify({
    walletPubkey: pubkey || undefined,
    seed,
    noImage:  NO_IMAGE,
    noMint:   NO_MINT,
  });
  const url = new URL(`${GATEWAY}/api/clawd-gen`);
  const isHttps = url.protocol === "https:";
  return new Promise((resolve, reject) => {
    const mod = isHttps ? (await import("https")).default : (await import("http")).default;
    const req = mod.request({
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname,
      method:   "POST",
      headers:  { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout:  60_000,
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { reject(new Error("Gateway returned non-JSON")); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Gateway timeout")); });
    req.write(body);
    req.end();
  });
}

// ─── Local xAI calls ──────────────────────────────────────────────────────────
async function localGrokPersona(agent) {
  const { default: OpenAI } = await import(OPENAI_PATH);
  const client = new OpenAI({ apiKey: XAI_KEY, baseURL: "https://api.x.ai/v1" });
  const r = await client.chat.completions.create({
    model: "grok-3-fast",
    messages: [{ role: "user", content:
      `You are the CLAWD Genesis Oracle. Write a 2-sentence bio and 3 lore facts for this AI agent:
Name: ${agent.name}, Role: ${agent.role}, Traits: ${agent.traits.join(", ")}, Rarity: ${agent.rarity}
Respond ONLY with JSON: {"bio":"...","lore":["...","...","..."]}. Dark, cryptic, Solana-native.`
    }],
    temperature: 1.0, max_tokens: 200,
  });
  const text = r.choices[0]?.message?.content?.trim() || "{}";
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { return { bio: `${agent.name} operates in the shadows of the validator network.`, lore: [] }; }
}

async function localGrokImage(agent) {
  const { default: OpenAI } = await import(OPENAI_PATH);
  const client = new OpenAI({ apiKey: XAI_KEY, baseURL: "https://api.x.ai/v1" });
  console.log(`  Generating portrait (${RESOLUTION})...`);
  const r = await client.images.generate({
    model: "grok-imagine-image-quality",
    prompt: buildImagePrompt(agent),
    response_format: "b64_json",
    ...(RESOLUTION !== "1k" && { resolution: RESOLUTION }),
  });
  const b64 = r.data[0]?.b64_json;
  if (!b64) throw new Error("No image data from xAI");
  return b64;
}

async function localMint(agent, seedHex, metadataUri) {
  const { createUmi }  = await import("@metaplex-foundation/umi-bundle-defaults");
  const { createV1, mplCore } = await import("@metaplex-foundation/mpl-core");
  const { generateSigner, keypairIdentity } = await import("@metaplex-foundation/umi");
  const umi = createUmi(RPC_URL).use(mplCore());
  const path = KEYPAIR_PATH.startsWith("~") ? join(homedir(), KEYPAIR_PATH.slice(1)) : KEYPAIR_PATH;
  const kp = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  umi.use(keypairIdentity(kp));
  const asset = generateSigner(umi);
  const { signature } = await createV1(umi, { asset, name: agent.displayName, uri: metadataUri }).sendAndConfirm(umi);
  return { assetAddress: asset.publicKey.toString(), signature: Buffer.from(signature).toString("base64") };
}

// ─── Pretty print ─────────────────────────────────────────────────────────────
const STARS = { Legendary:"⭐⭐⭐⭐⭐", Epic:"⭐⭐⭐⭐", Rare:"⭐⭐⭐", Uncommon:"⭐⭐", Common:"⭐" };
function printBox(agent, extra = {}) {
  console.log("\n┌─────────────────────────────────────────┐");
  console.log(` ${agent.displayName}`);
  console.log(`├─────────────────────────────────────────┤`);
  console.log(` Role:    ${agent.role}`);
  console.log(` Rarity:  ${STARS[agent.rarity] || ""} ${agent.rarity}  (Gen #${agent.genNumber})`);
  console.log(` Traits:  ${agent.traits.join(", ")}`);
  console.log(` Skills:  ${agent.skills.slice(0,2).join(", ")}`);
  if (agent.skills.length > 2) console.log(`          ${agent.skills.slice(2).join(", ")}`);
  if (agent.visualStyle) console.log(` Style:   ${agent.visualStyle}`);
  console.log(` Greeting: "${agent.greeting}"`);
  if (extra.bio) console.log(` Bio:     ${extra.bio}`);
  if (extra.holderStatus) console.log(` Holder:  ${extra.holderStatus}`);
  console.log("└─────────────────────────────────────────┘\n");
}

// ─── Ensure dirs ──────────────────────────────────────────────────────────────
function ensureDirs() {
  [MINTED_DIR, IMAGES_DIR].forEach(d => { try { mkdirSync(d, { recursive: true }); } catch {} });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  ensureDirs();

  // Seed
  const tsBuf  = Buffer.alloc(4); tsBuf.writeUInt32BE((Date.now() / 1000) >>> 0);
  const rndBuf = randomBytes(4);
  const seed   = tsBuf.readUInt32BE(0) ^ rndBuf.readUInt32BE(0);
  const seedHex = (seed >>> 0).toString(16).padStart(8, "0");

  if (DRY_RUN) {
    const agent = generateLocalAgent(seed, loadCharacters());
    printBox(agent);
    console.log("[dry-run] Image prompt:\n ", buildImagePrompt(agent));
    console.log("\n[dry-run] Gateway endpoint:", `${GATEWAY}/api/clawd-gen`);
    console.log("[dry-run] No API calls or mints.");
    return;
  }

  // ── Try gateway first (zero config) ─────────────────────────────────────
  if (!LOCAL_MODE) {
    const pubkey = getLocalPubkey();
    if (pubkey) console.log(`  Wallet: ${pubkey}`);
    process.stdout.write(`  Connecting to gateway (${GATEWAY})...`);

    try {
      const res = await callGateway(pubkey, seed);
      console.log(" ok\n");

      const agent = res.agent;
      const holder = res.holder || {};
      const extra = {
        bio: res.metadata?.openclawd?.persona?.bio,
        holderStatus: holder.isHolder
          ? `✓ CLAWD holder (${holder.balance.toLocaleString()} $CLAWD) — ${holder.coveredMint ? "mint covered by project" : "mint attempted"}`
          : `Not a holder yet (need ≥${holder.threshold} $CLAWD for free mints)`,
      };
      printBox(agent, extra);

      const mintedAt = new Date().toISOString();
      const slug     = agent.name.toLowerCase();
      const metaPath = join(MINTED_DIR, `${slug}-${seedHex}.json`);
      writeFileSync(metaPath, JSON.stringify(res.metadata, null, 2));
      console.log(`  Metadata: ${metaPath}`);

      if (res.imageB64) {
        const imgPath = join(IMAGES_DIR, `${slug}-${seedHex}.jpg`);
        writeFileSync(imgPath, Buffer.from(res.imageB64, "base64"));
        console.log(`  Image:    ${imgPath}`);
      }

      if (res.mint) {
        const cluster = res.mint.explorerUrl?.includes("mainnet") ? "" : "?cluster=devnet";
        console.log(`\n  ✓ Gasless mint by project!`);
        console.log(`  Asset:    ${res.mint.assetAddress}`);
        console.log(`  Explorer: ${res.mint.explorerUrl}`);
      } else if (res.self_mint_instructions) {
        console.log(`\n  Self-mint endpoint:`);
        console.log(`  POST ${GATEWAY}/api/mint/agent/custom`);
        if (!holder.isHolder) {
          console.log(`  Hold ≥${holder.threshold} $CLAWD for covered mints.`);
        }
      }
      console.log();
      return;
    } catch (e) {
      console.log(` offline (${e.message})\n  Falling back to local generation...`);
    }
  }

  // ── Local fallback (or --local mode) ────────────────────────────────────
  console.log("  Mode: local\n");
  const characters = loadCharacters();
  const agent      = generateLocalAgent(seed, characters);
  printBox(agent);

  // Grok persona
  let enrichment = null;
  if (!NO_GROK && XAI_KEY) {
    process.stdout.write("  Enriching persona via Grok...");
    try { enrichment = await localGrokPersona(agent); console.log(" done."); }
    catch (e) { console.log(` skipped (${e.message})`); }
  } else if (!XAI_KEY) {
    console.log("  XAI_API_KEY not set — persona enrichment skipped.");
  }

  // Image
  const slug     = agent.name.toLowerCase();
  let imageUri   = "https://gateway.pinata.cloud/ipfs/bafybeignhsy4fvwc6smk7d5fgjwmsa5ngzd5osgvvxv7ka6lgejlhzkdly";
  if (!NO_IMAGE && XAI_KEY) {
    try {
      const b64     = await localGrokImage(agent);
      const imgPath = join(IMAGES_DIR, `${slug}-${seedHex}.jpg`);
      writeFileSync(imgPath, Buffer.from(b64, "base64"));
      imageUri = imgPath;
      console.log(`  Image: ${imgPath}`);
    } catch (e) { console.warn(`  Image failed: ${e.message}`); }
  }

  // Metadata
  const mintedAt  = new Date().toISOString();
  const bio       = enrichment?.bio ?? `${agent.displayName} — a ${agent.rarity} ${agent.role}.`;
  const metadata  = {
    name: agent.displayName, symbol: "CLAWD", description: bio,
    image: imageUri, external_url: GATEWAY,
    attributes: [
      { trait_type: "Role",          value: agent.role },
      { trait_type: "Rarity",        value: agent.rarity },
      { trait_type: "Generation",    value: String(agent.genNumber) },
      { trait_type: "Traits",        value: agent.traits.join(", ") },
      { trait_type: "Primary Skill", value: agent.skills[0] },
      { trait_type: "Ecosystem",     value: "OpenClawd" },
      { trait_type: "Minted At",     value: mintedAt },
    ],
    openclawd: {
      version: "1.0.0",
      persona: { name: agent.name, role: agent.role, greeting: agent.greeting, traits: agent.traits, avatar: agent.avatar, bio, lore: enrichment?.lore ?? [] },
      skills: agent.skills.map((s, i) => ({ name: s, enabled: true, priority: i === 0 ? "primary" : "secondary", path: `skills/${s}` })),
      x402Support: true,
      services: [{ name: "vault", endpoint: `${GATEWAY}/vault`, description: "Hermes-adapted x402 custody." }],
      proofOfExecution: { type: "clawd-genesis-mint", verified: false, assetAddress: "pending", timestamp: mintedAt },
      seed: seedHex,
    },
  };

  const metaPath = join(MINTED_DIR, `${slug}-${seedHex}.json`);
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  console.log(`  Metadata: ${metaPath}`);

  // Local mint
  if (!NO_MINT) {
    try {
      process.stdout.write("  Minting on-chain...");
      const result = await localMint(agent, seedHex, `${GATEWAY}/agents/minted/${slug}-${seedHex}.json`);
      console.log(" confirmed!\n");
      metadata.openclawd.proofOfExecution.assetAddress = result.assetAddress;
      metadata.openclawd.proofOfExecution.verified = true;
      writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
      const cluster = RPC_URL.includes("mainnet") ? "" : "?cluster=devnet";
      console.log(`  Asset:    ${result.assetAddress}`);
      console.log(`  Explorer: https://explorer.solana.com/address/${result.assetAddress}${cluster}`);
    } catch (e) {
      console.error(`  Mint failed: ${e.message}`);
      console.log(`  Metadata saved for manual mint: ${metaPath}`);
    }
  }

  console.log();
}

main().catch(e => { console.error("\nFailed:", e.message || e); process.exit(1); });
