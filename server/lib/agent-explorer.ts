import WebSocket from "ws";
import bs58 from "bs58";
import { desc, eq, sql } from "drizzle-orm";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { fetchAsset, findAssetSignerPda, mplCore } from "@metaplex-foundation/mpl-core";
import {
  findAgentIdentityV2Pda,
  mplAgentIdentity,
  mplAgentTools,
  safeFetchAgentIdentityV1FromSeeds,
  safeFetchAgentIdentityV2FromSeeds,
} from "@metaplex-foundation/mpl-agent-registry";
import { db, hasDatabase } from "../db";
import { resolveHeliusRpcUrl } from "./helius/transactionOptimization";
import { agentFeedItems, metaplexAgents } from "../../drizzle/schema";

export const MPL_AGENT_IDENTITY_PROGRAM_ID = "1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p";
export const MPL_AGENT_TOOLS_PROGRAM_ID = "TLREGni9ZEyGC3vnPZtqUh95xQ8oPqJSvNjvB7FGK8S";
export const MPL_AGENT_REPUTATION_PROGRAM_ID = "REPREG5c1gPHuHukEyANpksLdHFaJCiTrm6zJgNhRZR";
export const MPL_AGENT_VALIDATION_PROGRAM_ID = "VALREGY66A9ieJfFUNs5GrxFTy498KUoSU7TbmSePQi";
export const MPL_CORE_PROGRAM_ID = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";

const DEFAULT_WATCH_ADDRESSES = [
  MPL_AGENT_IDENTITY_PROGRAM_ID,
  MPL_AGENT_TOOLS_PROGRAM_ID,
  MPL_AGENT_REPUTATION_PROGRAM_ID,
  MPL_AGENT_VALIDATION_PROGRAM_ID,
] as const;

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

type AgentExplorerSource = "helius-webhook" | "helius-wss" | "manual";
type Listener = (event: AgentExplorerRealtimeEvent) => void;

export type AgentExplorerRealtimeEvent = {
  type: "agent_observed";
  item: AgentExplorerItem;
};

export type AgentExplorerItem = {
  id?: number;
  assetAddress: string;
  signature?: string | null;
  slot?: number | null;
  blockTime?: number | null;
  network?: string | null;
  name?: string | null;
  image?: string | null;
  description?: string | null;
  registrationUri?: string | null;
  services: unknown[];
  active?: boolean | null;
  supportedTrust: unknown[];
  ownerWallet?: string | null;
  payerWallet?: string | null;
  authorityWallet?: string | null;
  agentIdentityPda?: string | null;
  assetSignerPda?: string | null;
  tokenMint?: string | null;
  genesisAccount?: string | null;
  lifecycleTransfer?: boolean | null;
  lifecycleUpdate?: boolean | null;
  lifecycleExecute?: boolean | null;
  metadata?: unknown;
  rawRegistry?: unknown;
  updatedAt?: string | Date | null;
  insertedAt?: string | Date | null;
  solscanUrl?: string | null;
  explorerUrl?: string | null;
};

type NormalizedInstruction = {
  programId: string | null;
  accounts: string[];
  data?: string | null;
  parsed?: unknown;
};

type ClassifiedAgentEvent = {
  eventType: string;
  assetAddress?: string | null;
  agentIdentityPda?: string | null;
  assetSignerPda?: string | null;
  collectionAddress?: string | null;
  payerWallet?: string | null;
  authorityWallet?: string | null;
  executiveAuthority?: string | null;
  executiveProfilePda?: string | null;
  delegateRecordPda?: string | null;
  delegated?: boolean | null;
  tokenMint?: string | null;
  genesisAccount?: string | null;
  registrationUri?: string | null;
};

let ws: WebSocket | null = null;
let started = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let pingTimer: NodeJS.Timeout | null = null;
let reconnectDelay = INITIAL_RECONNECT_MS;
let subscriptionId: number | string | null = null;
let lastMessageAt = 0;
let lastIngestedAt = 0;
let tablesReady = false;
let tableUnavailableReason: string | null = null;
let memoryFeed: AgentExplorerItem[] = [];

const listeners = new Set<Listener>();

async function ensureAgentExplorerTables() {
  if (!hasDatabase || tablesReady) return;
  try {
    await db.select({ id: agentFeedItems.id }).from(agentFeedItems).limit(1);
    tablesReady = true;
    tableUnavailableReason = null;
    return;
  } catch {}

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS agent_feed_items (
        id SERIAL PRIMARY KEY,
        asset_address TEXT NOT NULL UNIQUE,
        pda TEXT,
        wallet TEXT,
        signature TEXT UNIQUE,
        slot BIGINT,
        block_time BIGINT,
        network TEXT,
        name TEXT,
        image TEXT,
        description TEXT,
        registration_uri TEXT,
        services JSONB NOT NULL DEFAULT '[]'::jsonb,
        active BOOLEAN,
        supported_trust JSONB NOT NULL DEFAULT '[]'::jsonb,
        owner_wallet TEXT,
        payer_wallet TEXT,
        authority_wallet TEXT,
        collection_address TEXT,
        agent_identity_pda TEXT,
        asset_signer_pda TEXT,
        core_metadata_uri TEXT,
        schema_type TEXT,
        lifecycle_transfer BOOLEAN,
        lifecycle_update BOOLEAN,
        lifecycle_execute BOOLEAN,
        registrations JSONB NOT NULL DEFAULT '[]'::jsonb,
        metadata JSONB,
        raw_registry JSONB,
        wallet_balance_lamports TEXT,
        token_mint TEXT,
        genesis_account TEXT,
        launch_id TEXT,
        launch_url TEXT,
        launch_type TEXT,
        set_agent_token BOOLEAN,
        creator_fee_wallet TEXT,
        launch_signatures JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        inserted_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS agent_feed_items_inserted_at_idx
        ON agent_feed_items (inserted_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS agent_feed_items_updated_at_idx
        ON agent_feed_items (updated_at DESC)
    `);
    tablesReady = true;
    tableUnavailableReason = null;
  } catch (error) {
    tableUnavailableReason = error instanceof Error ? error.message : "agent_feed_items unavailable";
    console.warn("[agent-explorer] agent_feed_items unavailable:", tableUnavailableReason);
  }
}

function getEnv(name: string): string {
  return process.env[name]?.trim() || "";
}

function splitEnvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isSolanaAddress(value: unknown): value is string {
  return typeof value === "string" && SOLANA_ADDRESS_RE.test(value);
}

function shortAddress(value: string, chars = 5) {
  return value.length > chars * 2 ? `${value.slice(0, chars)}...${value.slice(-chars)}` : value;
}

function networkName() {
  const configured = getEnv("AGENT_EXPLORER_NETWORK");
  if (configured) return configured;
  const rpc = resolveHeliusRpcUrl();
  if (/devnet/i.test(rpc)) return "solana-devnet";
  if (/testnet/i.test(rpc)) return "solana-testnet";
  return "solana-mainnet";
}

export function getAgentExplorerWatchAddresses(): string[] {
  const disableDefaults = getEnv("AGENT_EXPLORER_DISABLE_DEFAULT_WATCH_ADDRESSES") === "true";
  const configured = splitEnvList(
    getEnv("AGENT_EXPLORER_WATCH_ADDRESSES") ||
      getEnv("HELIUS_AGENT_WATCH_ADDRESSES") ||
      getEnv("SOLANA_AGENT_WATCH_ADDRESSES"),
  );
  return unique([...(disableDefaults ? [] : DEFAULT_WATCH_ADDRESSES), ...configured]).filter(isSolanaAddress);
}

function watchedAddressSet() {
  return new Set([...getAgentExplorerWatchAddresses(), MPL_CORE_PROGRAM_ID, SYSTEM_PROGRAM_ID]);
}

export function resolveHeliusWssUrl(): string | null {
  if (getEnv("HELIUS_WSS_URL")) return getEnv("HELIUS_WSS_URL");
  if (getEnv("HELIUS_API_KEY")) {
    return `wss://mainnet.helius-rpc.com/?api-key=${getEnv("HELIUS_API_KEY")}`;
  }
  const rpc = getEnv("HELIUS_RPC_URL");
  if (rpc.startsWith("https://mainnet.helius-rpc.com")) return rpc.replace(/^https:/, "wss:");
  if (rpc.startsWith("http://mainnet.helius-rpc.com")) return rpc.replace(/^http:/, "ws:");
  return null;
}

function resolveHeliusApiKey(): string {
  const explicit = getEnv("HELIUS_API_KEY");
  if (explicit) return explicit;
  for (const rawUrl of [getEnv("HELIUS_RPC_URL"), getEnv("HELIUS_WSS_URL")]) {
    if (!rawUrl) continue;
    try {
      const url = new URL(rawUrl);
      const key = url.searchParams.get("api-key");
      if (key) return key;
    } catch {}
  }
  return "";
}

function resolvePublicAppUrl(): string {
  const direct =
    getEnv("AGENT_EXPLORER_PUBLIC_URL") ||
    getEnv("APP_ORIGIN") ||
    getEnv("PUBLIC_APP_URL") ||
    getEnv("VITE_APP_URL") ||
    getEnv("RENDER_EXTERNAL_URL");
  if (direct) return direct.replace(/\/$/, "");

  const replit = getEnv("REPLIT_DOMAINS").split(",")[0]?.trim();
  if (replit) return `https://${replit}`;
  return "";
}

function resolveWebhookUrl(explicit?: string | null): string {
  if (explicit?.trim()) return explicit.trim();
  const configured = getEnv("AGENT_EXPLORER_WEBHOOK_URL") || getEnv("HELIUS_AGENT_WEBHOOK_URL");
  if (configured) return configured;
  const base = resolvePublicAppUrl();
  return base ? `${base}/api/agent-explorer/webhook/helius` : "";
}

function resolveWebhookAuthHeader(explicit?: string | null): string | undefined {
  if (explicit?.trim()) return explicit.trim();
  const token = getEnv("AGENT_EXPLORER_WEBHOOK_AUTH_TOKEN") || getEnv("HELIUS_WEBHOOK_AUTH_TOKEN");
  return token ? `Bearer ${token}` : undefined;
}

export function isAuthorizedHeliusWebhook(headers: Pick<Headers, "get"> | Record<string, string | string[] | undefined>): boolean {
  const token = getEnv("AGENT_EXPLORER_WEBHOOK_AUTH_TOKEN") || getEnv("HELIUS_WEBHOOK_AUTH_TOKEN");
  if (!token) return true;
  const header =
    typeof (headers as Pick<Headers, "get">).get === "function"
      ? (headers as Pick<Headers, "get">).get("authorization")
      : (headers as Record<string, string | string[] | undefined>).authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return value === token || value === `Bearer ${token}`;
}

function keyToString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return null;
  const obj = value as Record<string, unknown>;
  const candidate =
    obj.pubkey ??
    obj.publicKey ??
    obj.account ??
    obj.address ??
    obj.owner ??
    obj.mint ??
    obj.toString;
  if (typeof candidate === "string") return candidate;
  if (typeof obj.toBase58 === "function") return String(obj.toBase58());
  if (typeof obj.toString === "function" && obj.toString !== Object.prototype.toString) return String(obj.toString());
  return null;
}

function extractAccountKeys(raw: any): string[] {
  const message =
    raw?.transaction?.transaction?.message ??
    raw?.transaction?.message ??
    raw?.message ??
    raw?.params?.result?.transaction?.transaction?.message;
  const keys = [
    ...(Array.isArray(raw?.accountKeys) ? raw.accountKeys : []),
    ...(Array.isArray(message?.accountKeys) ? message.accountKeys : []),
    ...(Array.isArray(raw?.accountData) ? raw.accountData.map((item: any) => item?.account) : []),
  ]
    .map(keyToString)
    .filter((key): key is string => Boolean(key));
  return unique(keys);
}

function normalizeInstruction(ix: any, accountKeys: string[]): NormalizedInstruction | null {
  if (!ix || typeof ix !== "object") return null;
  const programId =
    keyToString(ix.programId) ??
    keyToString(ix.program) ??
    (typeof ix.programIdIndex === "number" ? accountKeys[ix.programIdIndex] : null);
  const rawAccounts = Array.isArray(ix.accounts)
    ? ix.accounts
    : Array.isArray(ix.accountKeys)
      ? ix.accountKeys
      : [];
  const accounts = rawAccounts
    .map((account: unknown) => (typeof account === "number" ? accountKeys[account] : keyToString(account)))
    .filter((account: string | null | undefined): account is string => Boolean(account));
  return {
    programId,
    accounts,
    data: typeof ix.data === "string" ? ix.data : null,
    parsed: ix.parsed,
  };
}

function extractInstructions(raw: any, accountKeys: string[]): NormalizedInstruction[] {
  const tx = raw?.transaction ?? raw?.params?.result?.transaction ?? raw;
  const message = tx?.transaction?.message ?? tx?.message ?? raw?.transaction?.transaction?.message;
  const candidates = [
    ...(Array.isArray(raw?.instructions) ? raw.instructions : []),
    ...(Array.isArray(tx?.instructions) ? tx.instructions : []),
    ...(Array.isArray(message?.instructions) ? message.instructions : []),
  ];
  for (const group of tx?.meta?.innerInstructions ?? raw?.meta?.innerInstructions ?? []) {
    if (Array.isArray(group?.instructions)) candidates.push(...group.instructions);
  }
  const seen = new Set<string>();
  return candidates
    .map((ix) => normalizeInstruction(ix, accountKeys))
    .filter((ix): ix is NormalizedInstruction => {
      if (!ix?.programId) return false;
      const key = `${ix.programId}:${ix.accounts.join(",")}:${ix.data ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function decodeInstructionBytes(data?: string | null): Uint8Array | null {
  if (!data) return null;
  try {
    return bs58.decode(data);
  } catch {}
  try {
    return Uint8Array.from(Buffer.from(data, "base64"));
  } catch {}
  return null;
}

function instructionDiscriminator(data?: string | null): number | null {
  const bytes = decodeInstructionBytes(data);
  return bytes?.length ? bytes[0] : null;
}

function parseRegistrationUri(data?: string | null): string | null {
  const bytes = decodeInstructionBytes(data);
  if (!bytes || bytes.length < 12 || bytes[0] !== 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = view.getUint32(8, true);
  if (len <= 0 || len > 16_384 || bytes.length < 12 + len) return null;
  return new TextDecoder().decode(bytes.slice(12, 12 + len));
}

function classifyAgentEvent(instructions: NormalizedInstruction[]): ClassifiedAgentEvent {
  const identityIx = instructions.find((ix) => ix.programId === MPL_AGENT_IDENTITY_PROGRAM_ID);
  if (identityIx) {
    const discriminator = instructionDiscriminator(identityIx.data);
    if (discriminator === 1) {
      return {
        eventType: "set_agent_token",
        agentIdentityPda: identityIx.accounts[0],
        assetAddress: identityIx.accounts[1],
        genesisAccount: identityIx.accounts[2],
        payerWallet: identityIx.accounts[3],
        authorityWallet: identityIx.accounts[4],
        tokenMint: identityIx.accounts[2],
      };
    }
    return {
      eventType: "register_identity",
      agentIdentityPda: identityIx.accounts[0],
      assetAddress: identityIx.accounts[1],
      collectionAddress:
        identityIx.accounts[2] && identityIx.accounts[2] !== MPL_AGENT_IDENTITY_PROGRAM_ID
          ? identityIx.accounts[2]
          : null,
      payerWallet: identityIx.accounts[3],
      authorityWallet: identityIx.accounts[4],
      registrationUri: parseRegistrationUri(identityIx.data),
    };
  }

  const toolsIx = instructions.find((ix) => ix.programId === MPL_AGENT_TOOLS_PROGRAM_ID);
  if (toolsIx) {
    const discriminator = instructionDiscriminator(toolsIx.data);
    if (discriminator === 1) {
      return {
        eventType: "delegate_execution",
        delegated: true,
        executiveProfilePda: toolsIx.accounts[0],
        assetAddress: toolsIx.accounts[1],
        agentIdentityPda: toolsIx.accounts[2],
        delegateRecordPda: toolsIx.accounts[3],
        payerWallet: toolsIx.accounts[4],
        authorityWallet: toolsIx.accounts[5],
      };
    }
    return {
      eventType: "register_executive",
      executiveProfilePda: toolsIx.accounts[0],
      payerWallet: toolsIx.accounts[1],
      executiveAuthority: toolsIx.accounts[2],
    };
  }

  const reputationIx = instructions.find((ix) => ix.programId === MPL_AGENT_REPUTATION_PROGRAM_ID);
  if (reputationIx) {
    return {
      eventType: "register_reputation",
      assetAddress: reputationIx.accounts.find(isSolanaAddress),
      agentIdentityPda: reputationIx.accounts[0],
    };
  }

  const validationIx = instructions.find((ix) => ix.programId === MPL_AGENT_VALIDATION_PROGRAM_ID);
  if (validationIx) {
    return {
      eventType: "register_validation",
      assetAddress: validationIx.accounts.find(isSolanaAddress),
      agentIdentityPda: validationIx.accounts[0],
    };
  }

  return { eventType: "agent_transaction" };
}

function candidateAssetFromRaw(raw: any, accountKeys: string[], classified: ClassifiedAgentEvent): string {
  if (isSolanaAddress(classified.assetAddress)) return classified.assetAddress;
  const directCandidates = [
    raw?.assetAddress,
    raw?.asset,
    raw?.mint,
    raw?.events?.compressed?.assetId,
    raw?.events?.nft?.nfts?.[0]?.mint,
    raw?.events?.nft?.mint,
  ];
  const direct = directCandidates.find(isSolanaAddress);
  if (direct) return direct;

  const ignored = watchedAddressSet();
  const accountCandidate = accountKeys.find((key) => isSolanaAddress(key) && !ignored.has(key));
  if (accountCandidate) return accountCandidate;

  const signature = extractSignature(raw);
  return signature ? `event-${signature}` : `event-${Date.now()}`;
}

function extractSignature(raw: any): string | null {
  return (
    raw?.signature ??
    raw?.transaction?.signature ??
    raw?.transaction?.transaction?.signatures?.[0] ??
    raw?.params?.result?.signature ??
    null
  );
}

function extractSlot(raw: any): number | null {
  const value = raw?.slot ?? raw?.transaction?.slot ?? raw?.params?.result?.slot;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function extractBlockTime(raw: any): number | null {
  const value =
    raw?.blockTime ??
    raw?.block_time ??
    raw?.timestamp ??
    raw?.transaction?.blockTime ??
    raw?.params?.result?.blockTime;
  if (!Number.isFinite(Number(value))) return null;
  const n = Number(value);
  return n > 10_000_000_000 ? Math.floor(n / 1000) : n;
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionPubkeyToString(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value.__option === "None") return null;
  if (value.__option === "Some") return keyToString(value.value);
  return keyToString(value.value ?? value);
}

function balanceToLamports(balance: any): string | null {
  if (balance == null) return null;
  const basisPoints = balance.basisPoints ?? balance;
  return typeof basisPoints === "bigint" ? basisPoints.toString() : String(basisPoints);
}

async function fetchJsonUri(uri?: string | null): Promise<any | null> {
  if (!uri) return null;
  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    if (comma === -1) return null;
    const meta = uri.slice(0, comma);
    const body = uri.slice(comma + 1);
    const text = meta.includes(";base64")
      ? Buffer.from(body, "base64").toString("utf8")
      : decodeURIComponent(body);
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
  if (!/^https?:\/\//i.test(uri)) return null;
  try {
    const response = await fetch(uri, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("json")) return await response.json();
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  } catch {
    return null;
  }
}

function lifecycleEnabled(value: unknown): boolean | null {
  if (value == null) return null;
  return Boolean(value);
}

function updateAuthorityAddress(updateAuthority: any): string | null {
  return keyToString(updateAuthority?.address ?? updateAuthority?.publicKey ?? updateAuthority);
}

function collectionAddressFromAsset(asset: any): string | null {
  const updateAuthority = asset?.updateAuthority;
  if (updateAuthority?.type === "Collection" || updateAuthority?.__kind === "Collection") {
    return updateAuthorityAddress(updateAuthority);
  }
  const collection = asset?.collection ?? asset?.grouping?.find?.((item: any) => item?.group_key === "collection");
  return keyToString(collection?.address ?? collection?.group_value ?? collection);
}

async function fetchOnchainAgentContext(assetAddress: string, hintRegistrationUri?: string | null) {
  if (!isSolanaAddress(assetAddress)) return {};
  const umi = createUmi(resolveHeliusRpcUrl()).use(mplCore()).use(mplAgentIdentity()).use(mplAgentTools());
  const assetPk = umiPublicKey(assetAddress);
  const [agentIdentityPda] = findAgentIdentityV2Pda(umi, { asset: assetPk });
  const [assetSignerPda] = findAssetSignerPda(umi, { asset: assetPk });

  const asset = await fetchAsset(umi, assetPk).catch(() => null);
  const identityV2 = await safeFetchAgentIdentityV2FromSeeds(umi, { asset: assetPk }).catch(() => null);
  const identityV1 = identityV2 ? null : await safeFetchAgentIdentityV1FromSeeds(umi, { asset: assetPk }).catch(() => null);
  const identity = identityV2 ?? identityV1;
  const agentPlugin = (asset as any)?.agentIdentities?.[0] ?? null;
  const coreMetadataUri = (asset as any)?.uri ?? null;
  const registrationUri =
    hintRegistrationUri ??
    agentPlugin?.uri ??
    (identity as any)?.agentMetadataUri ??
    (identity as any)?.agentRegistrationUri ??
    (identity as any)?.registrationDoc ??
    null;
  const [nftMetadata, registrationDoc, walletBalance] = await Promise.all([
    fetchJsonUri(coreMetadataUri),
    fetchJsonUri(registrationUri),
    umi.rpc.getBalance(assetSignerPda).catch(() => null),
  ]);

  const lifecycle = agentPlugin?.lifecycleChecks ?? null;
  const name = registrationDoc?.name ?? nftMetadata?.name ?? (asset as any)?.name ?? null;
  const description = registrationDoc?.description ?? nftMetadata?.description ?? null;
  const image = registrationDoc?.image ?? nftMetadata?.image ?? nftMetadata?.properties?.image ?? null;

  return {
    isRegisteredAgent: Boolean(identity || agentPlugin),
    agentIdentityPda: keyToString(agentIdentityPda),
    assetSignerPda: keyToString(assetSignerPda),
    ownerWallet: keyToString((asset as any)?.owner),
    collectionAddress: collectionAddressFromAsset(asset),
    coreMetadataUri,
    registrationUri,
    name,
    description,
    image,
    active: typeof registrationDoc?.active === "boolean" ? registrationDoc.active : null,
    services: arrayOrEmpty(registrationDoc?.services),
    registrations: arrayOrEmpty(registrationDoc?.registrations),
    supportedTrust: arrayOrEmpty(registrationDoc?.supportedTrust),
    schemaType: registrationDoc?.type ?? nftMetadata?.type ?? null,
    lifecycleTransfer: lifecycleEnabled(lifecycle?.transfer),
    lifecycleUpdate: lifecycleEnabled(lifecycle?.update),
    lifecycleExecute: lifecycleEnabled(lifecycle?.execute),
    tokenMint: optionPubkeyToString((identity as any)?.agentToken),
    walletBalanceLamports: balanceToLamports(walletBalance),
    metadata: registrationDoc?.properties ?? registrationDoc?.metadata ?? null,
    nftMetadata,
    rawRegistry: {
      registration: registrationDoc,
      nftMetadata,
      agentIdentityVersion: identityV2 ? "v2" : identityV1 ? "v1" : null,
    },
  };
}

function compactRawEvent(raw: any, instructions: NormalizedInstruction[], accountKeys: string[], source: AgentExplorerSource) {
  return {
    source,
    type: raw?.type ?? null,
    description: raw?.description ?? null,
    signature: extractSignature(raw),
    slot: extractSlot(raw),
    accountKeys: accountKeys.slice(0, 40),
    instructions: instructions.slice(0, 24).map((ix) => ({
      programId: ix.programId,
      accounts: ix.accounts.slice(0, 12),
      discriminator: instructionDiscriminator(ix.data),
    })),
  };
}

function mergeRawRegistry(onchainRaw: any, rawEvent: any) {
  if (!onchainRaw) return { event: rawEvent };
  return { ...onchainRaw, event: rawEvent };
}

async function normalizedAgentFromEvent(raw: any, source: AgentExplorerSource) {
  const accountKeys = extractAccountKeys(raw);
  const instructions = extractInstructions(raw, accountKeys);
  const classified = classifyAgentEvent(instructions);
  const assetAddress = candidateAssetFromRaw(raw, accountKeys, classified);
  const onchain = await fetchOnchainAgentContext(assetAddress, classified.registrationUri);
  const rawEvent = compactRawEvent(raw, instructions, accountKeys, source);
  const name =
    (onchain as any).name ??
    (classified.eventType === "register_executive" ? "Executive profile" : null) ??
    shortAddress(assetAddress);

  return {
    assetAddress,
    pda: classified.agentIdentityPda ?? (onchain as any).agentIdentityPda ?? null,
    wallet: (onchain as any).assetSignerPda ?? classified.assetSignerPda ?? null,
    signature: extractSignature(raw),
    slot: extractSlot(raw),
    blockTime: extractBlockTime(raw),
    network: networkName(),
    name,
    image: (onchain as any).image ?? null,
    description: (onchain as any).description ?? raw?.description ?? classified.eventType,
    registrationUri: (onchain as any).registrationUri ?? classified.registrationUri ?? null,
    services: (onchain as any).services ?? [],
    active: (onchain as any).active ?? null,
    supportedTrust: (onchain as any).supportedTrust ?? [],
    ownerWallet: (onchain as any).ownerWallet ?? null,
    payerWallet: classified.payerWallet ?? null,
    authorityWallet: classified.authorityWallet ?? classified.executiveAuthority ?? null,
    collectionAddress: classified.collectionAddress ?? (onchain as any).collectionAddress ?? null,
    agentIdentityPda: classified.agentIdentityPda ?? (onchain as any).agentIdentityPda ?? null,
    assetSignerPda: (onchain as any).assetSignerPda ?? classified.assetSignerPda ?? null,
    coreMetadataUri: (onchain as any).coreMetadataUri ?? null,
    schemaType: (onchain as any).schemaType ?? classified.eventType,
    lifecycleTransfer: (onchain as any).lifecycleTransfer ?? null,
    lifecycleUpdate: (onchain as any).lifecycleUpdate ?? null,
    lifecycleExecute: (onchain as any).lifecycleExecute ?? null,
    registrations: (onchain as any).registrations ?? [],
    metadata: {
      ...(((onchain as any).metadata && typeof (onchain as any).metadata === "object") ? (onchain as any).metadata : {}),
      eventType: classified.eventType,
      source,
    },
    rawRegistry: mergeRawRegistry((onchain as any).rawRegistry, rawEvent),
    walletBalanceLamports: (onchain as any).walletBalanceLamports ?? null,
    tokenMint: classified.tokenMint ?? (onchain as any).tokenMint ?? null,
    genesisAccount: classified.genesisAccount ?? null,
    launchId: null,
    launchUrl: null,
    launchType: null,
    setAgentToken: classified.eventType === "set_agent_token" ? true : null,
    creatorFeeWallet: null,
    launchSignatures: [],
    updatedAt: new Date(),
    _classified: classified,
    _isRegisteredAgent: Boolean((onchain as any).isRegisteredAgent || classified.eventType === "register_identity"),
  };
}

function toPublicItem(row: any): AgentExplorerItem {
  const assetAddress = row.assetAddress ?? row.asset_address;
  const isAddress = isSolanaAddress(assetAddress);
  return {
    id: row.id,
    assetAddress,
    signature: row.signature ?? null,
    slot: row.slot == null ? null : Number(row.slot),
    blockTime: row.blockTime ?? row.block_time ?? null,
    network: row.network ?? null,
    name: row.name ?? null,
    image: row.image ?? null,
    description: row.description ?? null,
    registrationUri: row.registrationUri ?? row.registration_uri ?? null,
    services: arrayOrEmpty(row.services),
    active: row.active ?? null,
    supportedTrust: arrayOrEmpty(row.supportedTrust ?? row.supported_trust),
    ownerWallet: row.ownerWallet ?? row.owner_wallet ?? null,
    payerWallet: row.payerWallet ?? row.payer_wallet ?? null,
    authorityWallet: row.authorityWallet ?? row.authority_wallet ?? null,
    agentIdentityPda: row.agentIdentityPda ?? row.agent_identity_pda ?? null,
    assetSignerPda: row.assetSignerPda ?? row.asset_signer_pda ?? null,
    tokenMint: row.tokenMint ?? row.token_mint ?? null,
    genesisAccount: row.genesisAccount ?? row.genesis_account ?? null,
    lifecycleTransfer: row.lifecycleTransfer ?? row.lifecycle_transfer ?? null,
    lifecycleUpdate: row.lifecycleUpdate ?? row.lifecycle_update ?? null,
    lifecycleExecute: row.lifecycleExecute ?? row.lifecycle_execute ?? null,
    metadata: row.metadata ?? null,
    rawRegistry: row.rawRegistry ?? row.raw_registry ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
    insertedAt: row.insertedAt ?? row.inserted_at ?? null,
    solscanUrl: isAddress ? `https://solscan.io/token/${assetAddress}` : null,
    explorerUrl: isAddress ? `https://explorer.solana.com/address/${assetAddress}` : null,
  };
}

function publish(item: AgentExplorerItem) {
  const event: AgentExplorerRealtimeEvent = { type: "agent_observed", item };
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {}
  }
}

function addMemoryFeed(item: AgentExplorerItem) {
  memoryFeed = [item, ...memoryFeed.filter((row) => row.assetAddress !== item.assetAddress)].slice(0, 100);
  return item;
}

async function upsertFeed(values: any): Promise<AgentExplorerItem> {
  if (!hasDatabase) return addMemoryFeed(toPublicItem(values));
  await ensureAgentExplorerTables();
  if (!tablesReady) return addMemoryFeed(toPublicItem(values));
  const { _classified, _isRegisteredAgent, ...dbValues } = values;
  const updateSet = { ...dbValues, updatedAt: new Date() };

  try {
    const [row] = await db
      .insert(agentFeedItems)
      .values(dbValues)
      .onConflictDoUpdate({
        target: agentFeedItems.assetAddress,
        set: updateSet,
      })
      .returning();
    await upsertMetaplexAgent(values).catch((error) => {
      console.warn("[agent-explorer] metaplex agent upsert failed:", error?.message ?? error);
    });
    return toPublicItem(row);
  } catch (error) {
    if (dbValues.signature) {
      await db.update(agentFeedItems).set(updateSet).where(eq(agentFeedItems.signature, dbValues.signature));
      const [row] = await db.select().from(agentFeedItems).where(eq(agentFeedItems.signature, dbValues.signature)).limit(1);
      await upsertMetaplexAgent(values).catch((inner) => {
        console.warn("[agent-explorer] metaplex agent upsert failed:", inner?.message ?? inner);
      });
      return toPublicItem(row ?? dbValues);
    }
    throw error;
  }
}

async function upsertMetaplexAgent(values: any) {
  if (!hasDatabase || !isSolanaAddress(values.assetAddress)) return;
  const classified = values._classified as ClassifiedAgentEvent | undefined;
  const row = {
    assetAddress: values.assetAddress,
    network: values.network ?? networkName(),
    ownerWallet: values.ownerWallet,
    payerWallet: values.payerWallet,
    authorityWallet: values.authorityWallet,
    collectionAddress: values.collectionAddress,
    agentIdentityPda: values.agentIdentityPda,
    assetSignerPda: values.assetSignerPda,
    coreMetadataUri: values.coreMetadataUri,
    agentRegistrationUri: values.registrationUri,
    schemaType: values.schemaType,
    name: values.name,
    description: values.description,
    image: values.image,
    active: values.active,
    lifecycleTransfer: values.lifecycleTransfer,
    lifecycleUpdate: values.lifecycleUpdate,
    lifecycleExecute: values.lifecycleExecute,
    services: values.services ?? [],
    registrations: values.registrations ?? [],
    supportedTrust: values.supportedTrust ?? [],
    metadata: values.metadata,
    nftMetadata: values.rawRegistry?.nftMetadata ?? values.rawRegistry?.nftMetadata ?? null,
    rawRegistry: values.rawRegistry,
    walletBalanceLamports: values.walletBalanceLamports,
    lastObservedSignature: values.signature,
    slot: values.slot == null ? undefined : BigInt(values.slot),
    blockTime: values.blockTime == null ? undefined : Number(values.blockTime),
    executiveAuthority: classified?.executiveAuthority,
    executiveProfilePda: classified?.executiveProfilePda,
    delegateRecordPda: classified?.delegateRecordPda,
    delegated: classified?.delegated,
    delegationSignature: classified?.eventType === "delegate_execution" ? values.signature : undefined,
    delegatedAt: classified?.eventType === "delegate_execution" ? new Date() : undefined,
    tokenMint: values.tokenMint,
    genesisAccount: values.genesisAccount,
    launchId: values.launchId,
    launchUrl: values.launchUrl,
    launchType: values.launchType,
    setAgentToken: values.setAgentToken,
    creatorFeeWallet: values.creatorFeeWallet,
    launchSignatures: values.launchSignatures ?? [],
    source: values.metadata?.source ?? "agent-explorer",
    status: values._isRegisteredAgent ? "registered" : classified?.eventType?.slice(0, 32) ?? "observed",
    verifiedAt: values._isRegisteredAgent ? new Date() : undefined,
    updatedAt: new Date(),
  };
  const updateSet = { ...row, updatedAt: new Date() };
  await db
    .insert(metaplexAgents)
    .values(row)
    .onConflictDoUpdate({
      target: metaplexAgents.assetAddress,
      set: updateSet,
    });
}

export async function ingestAgentExplorerPayload(payload: unknown, source: AgentExplorerSource = "helius-webhook") {
  const events = Array.isArray(payload) ? payload : [payload];
  const items: AgentExplorerItem[] = [];
  for (const raw of events) {
    try {
      const normalized = await normalizedAgentFromEvent(raw, source);
      const item = await upsertFeed(normalized);
      lastIngestedAt = Date.now();
      publish(item);
      items.push(item);
    } catch (error) {
      console.warn("[agent-explorer] failed to ingest event:", error instanceof Error ? error.message : error);
    }
  }
  return items;
}

export async function listAgentExplorerFeed(limit = 50): Promise<AgentExplorerItem[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  if (!hasDatabase) return memoryFeed.slice(0, safeLimit);
  await ensureAgentExplorerTables();
  if (!tablesReady) return memoryFeed.slice(0, safeLimit);
  const rows = await db.select().from(agentFeedItems).orderBy(desc(agentFeedItems.updatedAt)).limit(safeLimit);
  return rows.map(toPublicItem);
}

export function subscribeAgentExplorerEvents(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAgentExplorerStatus() {
  const webhookUrl = resolveWebhookUrl();
  const apiKey = resolveHeliusApiKey();
  const wssUrl = resolveHeliusWssUrl();
  return {
    databaseConfigured: hasDatabase,
    feedTableReady: tablesReady,
    feedTableIssue: tableUnavailableReason,
    rpcConfigured: Boolean(getEnv("HELIUS_RPC_URL") || getEnv("HELIUS_API_KEY")),
    wssConfigured: Boolean(wssUrl),
    apiKeyConfigured: Boolean(apiKey),
    webhookUrl,
    webhookUrlConfigured: Boolean(webhookUrl),
    canCreateWebhook: Boolean(apiKey && webhookUrl),
    webhookAuthConfigured: Boolean(getEnv("AGENT_EXPLORER_WEBHOOK_AUTH_TOKEN") || getEnv("HELIUS_WEBHOOK_AUTH_TOKEN")),
    network: networkName(),
    watchAddresses: getAgentExplorerWatchAddresses(),
    stream: heliusAgentExplorerStreamStatus(),
    lastIngestedAt,
    subscriberCount: listeners.size,
  };
}

export async function createHeliusAgentWebhook(args: {
  webhookUrl?: string | null;
  authHeader?: string | null;
  accountAddresses?: string[] | null;
  transactionTypes?: string[] | null;
}) {
  const apiKey = resolveHeliusApiKey();
  if (!apiKey) throw new Error("HELIUS_API_KEY or an api-key in HELIUS_RPC_URL is required");
  const webhookURL = resolveWebhookUrl(args.webhookUrl);
  if (!webhookURL) throw new Error("Set AGENT_EXPLORER_WEBHOOK_URL or APP_ORIGIN to create a Helius webhook");

  const accountAddresses = unique([
    ...(args.accountAddresses?.filter(isSolanaAddress) ?? []),
    ...getAgentExplorerWatchAddresses(),
  ]);
  if (accountAddresses.length === 0) throw new Error("No Solana agent watch addresses configured");

  const endpoint = getEnv("HELIUS_WEBHOOK_API_URL") || "https://api-mainnet.helius-rpc.com/v0/webhooks";
  const url = new URL(endpoint);
  url.searchParams.set("api-key", apiKey);

  const body = {
    webhookURL,
    transactionTypes: args.transactionTypes?.length ? args.transactionTypes : ["ANY"],
    accountAddresses,
    webhookType: "enhanced",
    authHeader: resolveWebhookAuthHeader(args.authHeader),
    txnStatus: "all",
    encoding: "jsonParsed",
  };

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!response.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }
  return { request: { ...body, authHeader: body.authHeader ? "configured" : undefined }, response: data };
}

function clearTimers() {
  if (pingTimer) clearInterval(pingTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  pingTimer = null;
  reconnectTimer = null;
}

function scheduleReconnect() {
  if (!started || reconnectTimer) return;
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectHeliusAgentStream();
  }, delay);
}

function sendSubscribe(socket: WebSocket) {
  const watchAddresses = getAgentExplorerWatchAddresses();
  if (watchAddresses.length === 0) return;
  socket.send(JSON.stringify({
    jsonrpc: "2.0",
    id: 721,
    method: "transactionSubscribe",
    params: [
      {
        failed: false,
        accountInclude: watchAddresses,
      },
      {
        commitment: "processed",
        encoding: "jsonParsed",
        transactionDetails: "full",
        maxSupportedTransactionVersion: 0,
      },
    ],
  }));
}

function connectHeliusAgentStream() {
  const url = resolveHeliusWssUrl();
  if (!url) {
    console.warn("[agent-explorer] HELIUS_WSS_URL/HELIUS_API_KEY missing; realtime agent stream disabled");
    return;
  }
  if (getAgentExplorerWatchAddresses().length === 0) {
    console.warn("[agent-explorer] no watch addresses configured; realtime agent stream disabled");
    return;
  }

  ws = new WebSocket(url);

  ws.on("open", () => {
    reconnectDelay = INITIAL_RECONNECT_MS;
    lastMessageAt = Date.now();
    sendSubscribe(ws!);
    console.log("[agent-explorer] connected to Helius agent transaction stream");
    pingTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.ping();
      if (Date.now() - lastMessageAt > 120_000) {
        console.warn("[agent-explorer] no stream messages for 120s; reconnecting");
        ws.terminate();
      }
    }, 30_000);
  });

  ws.on("message", (raw) => {
    lastMessageAt = Date.now();
    let msg: any;
    try {
      msg = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }
    if (msg.id === 721 && msg.result !== undefined) {
      subscriptionId = msg.result;
      console.log(`[agent-explorer] subscribed to Helius agent stream (${subscriptionId})`);
      return;
    }
    const result = msg?.params?.result;
    if (!result) return;
    void ingestAgentExplorerPayload(result, "helius-wss");
  });

  ws.on("error", (error) => {
    console.warn("[agent-explorer] websocket error:", error.message);
  });

  ws.on("close", () => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    ws = null;
    subscriptionId = null;
    if (started) scheduleReconnect();
  });
}

export function startHeliusAgentExplorerStream() {
  if (started || getEnv("AGENT_EXPLORER_STREAM_ENABLED") === "false") return;
  started = true;
  connectHeliusAgentStream();
}

export function stopHeliusAgentExplorerStream() {
  started = false;
  clearTimers();
  ws?.close();
  ws = null;
}

export function heliusAgentExplorerStreamStatus() {
  return {
    enabled: started,
    connected: ws?.readyState === WebSocket.OPEN,
    subscriptionId,
    lastMessageAt,
    watchAddresses: getAgentExplorerWatchAddresses(),
  };
}
