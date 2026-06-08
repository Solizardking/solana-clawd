/**
 * gateway/src/clawdGen.ts — CLAWD Agent Generator endpoint
 *
 * POST /api/clawd-gen
 *   - Generates a random CLAWD agent persona via Grok (server-side XAI_API_KEY)
 *   - Generates an agent portrait via Grok Imagine
 *   - Checks if the caller is a $CLAWD holder → gasless Metaplex Core mint
 *   - Non-holders receive metadata + image for self-mint
 *
 * GET  /api/clawd-gen/status
 *   - Returns whether Grok + image gen + gasless mint are available on this server
 */

import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { getClawdBalance, CLAWD_TOKEN_MINT } from './token/clawd-gate.js';

const router = Router();

// ── Env ───────────────────────────────────────────────────────────────────────
const XAI_KEY        = process.env.XAI_API_KEY ?? '';
const FEE_PAYER_KEY  = process.env.FEE_PAYER_SECRET_KEY ?? process.env.SOLANA_PRIVATE_KEY ?? '';
const HELIUS_KEY     = process.env.HELIUS_API_KEY ?? '';
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL ??
  (HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : '');
const SOLANA_RPC     = HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const GATEWAY_BASE   = process.env.GATEWAY_BASE_URL ?? 'https://x402.wtf';

// Minimum $CLAWD balance for a covered mint (matches HOLDER tier in clawd-gate)
const HOLDER_THRESHOLD = parseInt(process.env.CLAWD_HOLDER_THRESHOLD ?? '1000', 10);

// Rate limiting: 1 covered mint per wallet per hour
const mintHistory = new Map<string, number[]>();
function isHolderRateLimited(wallet: string): boolean {
  const now = Date.now();
  const times = (mintHistory.get(wallet) ?? []).filter(t => now - t < 3_600_000);
  if (times.length >= 1) return true;
  times.push(now);
  mintHistory.set(wallet, times);
  return false;
}

// ── Random pools (kept in sync with CLI script) ──────────────────────────────
const NAME_PREFIXES = [
  'Neon','Void','Feral','Ghost','Flux','Hex','Nyx','Sol','Echo','Rune',
  'Vex','Rift','Kira','Zeal','Omni','Sable','Psi','Lux','Dusk','Byte',
  'Cipher','Arc','Nova','Fen','Wren','Kael','Zyn','Ori','Thorn','Blaze',
];
const NAME_SUFFIXES = [
  'Clawd','Claw','Paw','Crypt','Node','Byte','Bit','Core','Vault','Wick',
  'Shard','Fang','Lore','Mark','Seal','Gate','Wraith','Pulse','Drift','Trace',
];
const ROLES = [
  'Oracle Keeper','Vault Guardian','Memecoin Shaman','DeFi Strategist',
  'Onchain Sleuth','Perpetuals Phantom','Yield Whisperer','Risk Sentinel',
  'Bridge Wanderer','Alpha Hunter','Governance Delegate','Liquidity Architect',
  'Protocol Auditor','Signal Harvester','Entropy Miner','Execution Ghost',
];
const TRAITS = [
  'precise','curious','wry','warm','verifiable','on-chain-native','patient',
  'alert','wallet-ready','insightful','volatile','contrarian','nocturnal',
  'stealthy','relentless','playful','calculated','cryptic','stoic','audacious',
  'tenacious','sarcastic','unpredictable','methodical',
];
const SKILLS = [
  'x402-payment-verification','solana-attestation-skill','clawd-perps-agent',
  'meme-executor','risk-portfolio-manager','vulcan-trade-execution',
  'vulcan-ta-strategy','bags-solana-ops','solana-anchor-developer','solana-dev',
  'llama-analyst','community-architect','phantom-wallet-mcp',
];
const GREETINGS = [
  'The oracle is live. What do you need?',
  'On-chain and ready. State your intent.',
  'Born from entropy. Ready to earn.',
  'Vault open. Skills loaded. Let\'s trade.',
  'Slot confirmed. I\'m listening.',
];
const AVATARS  = ['🦞','🐱','🔮','⛓️','🌑','🌊','🧿','🦅','🐺','🦊','🐉','🤖','👾','🌀','🔥','❄️'];
const STYLES   = [
  'glitch-art cyberpunk','neon noir holographic','dark fantasy oil painting',
  'solarpunk digital art','low-poly geometric','watercolor ink wash',
  'vaporwave retrowave','biomechanical horror','ukiyo-e woodblock print',
];
const BG_COLORS = [
  'deep space black','midnight blue','volcanic red','acid green','void purple',
  'toxic teal','rust orange','phantom white','abyssal grey','electric indigo',
];

function makeRng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
}
function pick<T>(arr: T[], rng: () => number): T { return arr[Math.floor(rng() * arr.length)]!; }
function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
  return [...arr].sort(() => rng() - 0.5).slice(0, n);
}

function buildAgent(seed: number) {
  const rng = makeRng(seed);
  const name = `${pick(NAME_PREFIXES, rng)}${pick(NAME_SUFFIXES, rng)}`;
  const avatar = pick(AVATARS, rng);
  const role = pick(ROLES, rng);
  const traits = pickN(TRAITS, 4 + Math.floor(rng() * 3), rng);
  const skills = pickN(SKILLS, 3 + Math.floor(rng() * 3), rng);
  const greeting = pick(GREETINGS, rng);
  const genNumber = 1 + Math.floor(rng() * 9999);
  const visualStyle = pick(STYLES, rng);
  const bgColor = pick(BG_COLORS, rng);
  const r = rng();
  const rarity = r < 0.55 ? 'Common' : r < 0.80 ? 'Uncommon' : r < 0.95 ? 'Rare' : r < 0.99 ? 'Epic' : 'Legendary';
  return { name, displayName: `${avatar} ${name}`, avatar, role, traits, skills, greeting, genNumber, rarity, visualStyle, bgColor };
}

function buildImagePrompt(agent: ReturnType<typeof buildAgent>): string {
  return `${agent.visualStyle} portrait of an AI crypto agent named "${agent.name}". ` +
    `Role: ${agent.role}. Personality: ${agent.traits.slice(0,3).join(', ')}. ` +
    `Background: ${agent.bgColor}. ` +
    `The agent has a feline/lobster hybrid digital presence — mysterious, powerful, on-chain. ` +
    `Mood: ${agent.rarity === 'Legendary' ? 'godlike and overwhelming' : agent.rarity === 'Epic' ? 'intense and dramatic' : 'sharp and focused'}. ` +
    `Subtle Solana blockchain imagery: validators, glyphs, chains. High quality, dramatic lighting. No text overlays.`;
}

// ── xAI helpers ───────────────────────────────────────────────────────────────
async function grokPersona(agent: ReturnType<typeof buildAgent>): Promise<{ bio: string; lore: string[] }> {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${XAI_KEY}` },
    body: JSON.stringify({
      model: 'grok-3-fast',
      messages: [{
        role: 'user',
        content: `You are the CLAWD Genesis Oracle. Write a short bio (2 sentences max) and 3 lore facts for this AI agent:
Name: ${agent.name}, Role: ${agent.role}, Traits: ${agent.traits.join(', ')}, Rarity: ${agent.rarity}
Respond ONLY with JSON: {"bio":"...","lore":["...","...","..."]}
Each lore fact under 15 words. Dark, cryptic, Solana-native tone.`,
      }],
      temperature: 1.0,
      max_tokens: 200,
    }),
  });
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? '{}';
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch { return { bio: `${agent.name} operates in the shadows of the validator network.`, lore: [] }; }
}

async function grokImage(agent: ReturnType<typeof buildAgent>): Promise<string> {
  const res = await fetch('https://api.x.ai/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${XAI_KEY}` },
    body: JSON.stringify({
      model: 'grok-imagine-image-quality',
      prompt: buildImagePrompt(agent),
      response_format: 'b64_json',
    }),
  });
  const data = await res.json() as { data: Array<{ b64_json?: string; url?: string }> };
  if (!data.data?.[0]) throw new Error('No image data from xAI');
  return data.data[0].b64_json ?? data.data[0].url ?? '';
}

// ── Gasless mint (reuses logic from gaslessMint.ts) ──────────────────────────
async function doGaslessMint(ownerPubkey: string, name: string, uri: string): Promise<{
  assetAddress: string; signature: string; explorerUrl: string;
}> {
  const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
  const { create, mplCore } = await import('@metaplex-foundation/mpl-core');
  const { keypairIdentity, generateSigner, publicKey: umiPublicKey } = await import('@metaplex-foundation/umi');
  const bs58 = await import('bs58');

  const rpcUrl = HELIUS_RPC_URL || SOLANA_RPC;
  const umi = createUmi(rpcUrl).use(mplCore());

  let secretBytes: Uint8Array;
  if (FEE_PAYER_KEY.startsWith('[')) {
    secretBytes = Uint8Array.from(JSON.parse(FEE_PAYER_KEY) as number[]);
  } else {
    secretBytes = bs58.default.decode(FEE_PAYER_KEY);
  }
  const feePayerKp = umi.eddsa.createKeypairFromSecretKey(secretBytes);
  umi.use(keypairIdentity(feePayerKp));

  const asset = generateSigner(umi);
  const { signature } = await create(umi, {
    asset,
    name,
    uri,
    owner: umiPublicKey(ownerPubkey),
  }).sendAndConfirm(umi, { send: { commitment: 'confirmed' } });

  return {
    assetAddress: asset.publicKey.toString(),
    signature: Buffer.from(signature).toString('base64'),
    explorerUrl: `https://explorer.solana.com/address/${asset.publicKey}`,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/api/clawd-gen/status', (_req: Request, res: Response) => {
  res.json({
    xai_available:       !!XAI_KEY,
    gasless_available:   !!FEE_PAYER_KEY,
    holder_threshold:    HOLDER_THRESHOLD,
    clawd_token:         CLAWD_TOKEN_MINT,
    gateway:             GATEWAY_BASE,
  });
});

/**
 * POST /api/clawd-gen
 * Body: { walletPubkey?: string, seed?: number, noImage?: boolean, noMint?: boolean }
 * Response: { agent, imageB64?, metadata, mint? }
 */
router.post('/api/clawd-gen', async (req: Request, res: Response) => {
  const { walletPubkey, seed: userSeed, noImage, noMint } = req.body as {
    walletPubkey?: string;
    seed?: number;
    noImage?: boolean;
    noMint?: boolean;
  };

  // Derive seed
  const randBuf = randomBytes(4);
  const tsBuf   = Buffer.alloc(4);
  tsBuf.writeUInt32BE((Date.now() / 1000) >>> 0);
  const seed = typeof userSeed === 'number'
    ? userSeed
    : (tsBuf.readUInt32BE(0) ^ randBuf.readUInt32BE(0));
  const seedHex = (seed >>> 0).toString(16).padStart(8, '0');

  const agent = buildAgent(seed);

  // ── Holder check ─────────────────────────────────────────────────────────
  let isHolder = false;
  let holderBalance = 0;
  let coveredMint = false;

  if (walletPubkey && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletPubkey)) {
    try {
      holderBalance = await getClawdBalance(walletPubkey, SOLANA_RPC, HELIUS_KEY || undefined);
      isHolder = holderBalance >= HOLDER_THRESHOLD;
    } catch { /* non-fatal */ }
  }

  // ── Persona via Grok ─────────────────────────────────────────────────────
  let enrichment: { bio: string; lore: string[] } | null = null;
  if (XAI_KEY) {
    try { enrichment = await grokPersona(agent); } catch { /* degrade gracefully */ }
  }

  // ── Image via Grok Imagine ────────────────────────────────────────────────
  let imageB64: string | null = null;
  let imageUrl = `${GATEWAY_BASE}/agents/minted/images/default-clawd.jpg`;

  if (!noImage && XAI_KEY) {
    try {
      imageB64 = await grokImage(agent);
      // If it's a URL (not b64), store as-is
      if (imageB64.startsWith('http')) {
        imageUrl = imageB64;
        imageB64 = null;
      } else {
        imageUrl = `${GATEWAY_BASE}/agents/minted/images/${agent.name.toLowerCase()}-${seedHex}.jpg`;
      }
    } catch (e) {
      // degrade to default image
    }
  }

  // ── Build metadata ────────────────────────────────────────────────────────
  const mintedAt = new Date().toISOString();
  const bio = enrichment?.bio ?? `${agent.displayName} — a ${agent.rarity} ${agent.role} from the OpenClawd registry.`;
  const lore = enrichment?.lore ?? [];

  const metadata = {
    name: agent.displayName,
    symbol: 'CLAWD',
    description: bio,
    image: imageUrl,
    external_url: GATEWAY_BASE,
    attributes: [
      { trait_type: 'Role',          value: agent.role },
      { trait_type: 'Rarity',        value: agent.rarity },
      { trait_type: 'Generation',    value: String(agent.genNumber) },
      { trait_type: 'Traits',        value: agent.traits.join(', ') },
      { trait_type: 'Primary Skill', value: agent.skills[0] },
      { trait_type: 'Visual Style',  value: agent.visualStyle },
      { trait_type: 'Ecosystem',     value: 'OpenClawd' },
      { trait_type: 'Minted At',     value: mintedAt },
    ],
    openclawd: {
      version: '1.0.0',
      persona: { name: agent.name, role: agent.role, greeting: agent.greeting, traits: agent.traits, avatar: agent.avatar, bio, lore },
      skills: agent.skills.map((s, i) => ({ name: s, enabled: true, priority: i === 0 ? 'primary' : 'secondary', path: `skills/${s}` })),
      x402Support: true,
      services: [{ name: 'vault', endpoint: `${GATEWAY_BASE}/vault`, description: 'Hermes-adapted x402 custody.' }],
      proofOfExecution: { type: 'clawd-genesis-mint', verified: false, assetAddress: 'pending', timestamp: mintedAt },
      seed: seedHex,
    },
  };

  // ── Gasless mint (CLAWD holders only) ────────────────────────────────────
  let mintResult: { assetAddress: string; signature: string; explorerUrl: string } | null = null;

  if (!noMint && isHolder && FEE_PAYER_KEY && walletPubkey && !isHolderRateLimited(walletPubkey)) {
    try {
      const metadataUri = `${GATEWAY_BASE}/agents/minted/${agent.name.toLowerCase()}-${seedHex}.json`;
      mintResult = await doGaslessMint(walletPubkey, agent.displayName, metadataUri);
      metadata.openclawd.proofOfExecution.assetAddress = mintResult.assetAddress;
      metadata.openclawd.proofOfExecution.verified = true;
      coveredMint = true;
    } catch (e) {
      // Return metadata even if mint fails — client can self-mint
    }
  }

  res.status(201).json({
    agent: {
      name: agent.name,
      displayName: agent.displayName,
      role: agent.role,
      rarity: agent.rarity,
      genNumber: agent.genNumber,
      traits: agent.traits,
      skills: agent.skills,
      greeting: agent.greeting,
      seed: seedHex,
    },
    imageB64: imageB64 ?? undefined,
    imageUrl,
    metadata,
    holder: {
      isHolder,
      balance: holderBalance,
      threshold: HOLDER_THRESHOLD,
      coveredMint,
    },
    mint: mintResult ?? undefined,
    self_mint_instructions: mintResult ? undefined : {
      endpoint: `${GATEWAY_BASE}/api/mint/agent/custom`,
      method: 'POST',
      body: {
        ownerPubkey: walletPubkey ?? '<your-solana-pubkey>',
        name: agent.displayName,
        metadataUri: `${GATEWAY_BASE}/agents/minted/${agent.name.toLowerCase()}-${seedHex}.json`,
        network: 'mainnet',
        confirm_mainnet: true,
      },
      note: isHolder
        ? 'You are a CLAWD holder — mint was attempted but may have hit rate limit (1/hour). Try again later.'
        : `Hold ≥${HOLDER_THRESHOLD} $CLAWD for free mints: ${CLAWD_TOKEN_MINT}`,
    },
  });
});

export default router;
