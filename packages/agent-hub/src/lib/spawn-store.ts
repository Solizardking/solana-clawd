import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createHash, randomUUID } from "crypto";
import type { AgentTemplateSummary, CharacterSummary } from "./catalog.js";
import { resolveHubDataDir } from "./workspace.js";

export interface SpawnRecord {
  id: string;
  slug: string;
  status: "draft" | "provisioned" | "queued";
  createdAt: string;
  updatedAt: string;
  name: string;
  templateId: string;
  characterId: string;
  network: "solana-mainnet" | "solana-devnet";
  walletMode: "ephemeral" | "vault";
  runtime: "agentwallet" | "box" | "cloudflare";
  budgetUsd: number;
  mission: string;
  tags: string[];
  walletAddress: string;
  walletEndpoint?: string;
}

export interface CreateSpawnInput {
  name: string;
  template: AgentTemplateSummary;
  character: CharacterSummary;
  network: SpawnRecord["network"];
  walletMode: SpawnRecord["walletMode"];
  runtime: SpawnRecord["runtime"];
  budgetUsd: number;
  mission: string;
}

const FILE_NAME = "spawn-records.json";

function ensureDataDir(): string {
  const dir = resolveHubDataDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

function storePath(): string {
  return join(ensureDataDir(), FILE_NAME);
}

function generateWalletAddress(seed: string): string {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return `spawn_${digest}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function listSpawnRecords(): SpawnRecord[] {
  const path = storePath();
  if (!existsSync(path)) {
    return [];
  }

  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as SpawnRecord[];
    return Array.isArray(data) ? data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  } catch {
    return [];
  }
}

function saveSpawnRecords(records: SpawnRecord[]): void {
  writeFileSync(storePath(), JSON.stringify(records, null, 2));
}

export function createSpawnRecord(input: CreateSpawnInput): SpawnRecord {
  const now = new Date().toISOString();
  const id = randomUUID();
  const record: SpawnRecord = {
    id,
    slug: slugify(input.name || `${input.character.name}-${input.template.name}`),
    status: input.runtime === "box" ? "queued" : "provisioned",
    createdAt: now,
    updatedAt: now,
    name: input.name,
    templateId: input.template.id,
    characterId: input.character.id,
    network: input.network,
    walletMode: input.walletMode,
    runtime: input.runtime,
    budgetUsd: input.budgetUsd,
    mission: input.mission,
    tags: [...new Set([...input.template.tags, ...input.character.topics.slice(0, 3)])],
    walletAddress: generateWalletAddress(`${id}:${input.name}:${input.character.id}`),
    walletEndpoint: input.walletMode === "vault" ? input.character.walletEndpoint : undefined,
  };

  const records = listSpawnRecords();
  records.unshift(record);
  saveSpawnRecords(records);
  return record;
}
