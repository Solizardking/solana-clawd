import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ClawdHolderTier } from "../token/clawd-gate.js";

export type LocalApiKeyRecord = {
  id: string;
  keyPrefix: string;
  keyHash: string;
  name: string;
  walletAddress: string;
  ownerUserId?: string | null;
  ownerAuthProvider?: string | null;
  ownerTokenType?: string | null;
  holderTier: ClawdHolderTier;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
  monthlyLimitUSDC?: number | null;
  usage: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUSDC: number;
  };
};

export type IssuedLocalApiKey = {
  apiKey: string;
  record: Omit<LocalApiKeyRecord, "keyHash">;
};

type ApiKeyStoreFile = {
  version: 1;
  keys: LocalApiKeyRecord[];
};

export async function issueLocalApiKey(
  storePath: string,
  params: {
    name: string;
    walletAddress: string;
    ownerUserId?: string | null;
    ownerAuthProvider?: string | null;
    ownerTokenType?: string | null;
    holderTier: ClawdHolderTier;
    scopes?: string[];
    signingSecret?: string;
    monthlyLimitUSDC?: number | null;
  },
): Promise<IssuedLocalApiKey> {
  const id = `key_${randomBytes(12).toString("hex")}`;
  const scopes = params.scopes?.length ? params.scopes : ["inference:write", "usage:read"];
  const secret = params.signingSecret
    ? signApiKey(
        {
          id,
          walletAddress: params.walletAddress,
          ownerUserId: params.ownerUserId ?? null,
          ownerAuthProvider: params.ownerAuthProvider ?? null,
          ownerTokenType: params.ownerTokenType ?? null,
          holderTier: params.holderTier,
          scopes,
          monthlyLimitUSDC: params.monthlyLimitUSDC ?? null,
          issuedAt: new Date().toISOString(),
        },
        params.signingSecret,
      )
    : `clawd_sk_${randomBytes(32).toString("base64url")}`;
  const record: LocalApiKeyRecord = {
    id,
    keyPrefix: secret.slice(0, 17),
    keyHash: hashApiKey(secret),
    name: params.name,
    walletAddress: params.walletAddress,
    ownerUserId: params.ownerUserId ?? null,
    ownerAuthProvider: params.ownerAuthProvider ?? null,
    ownerTokenType: params.ownerTokenType ?? null,
    holderTier: params.holderTier,
    scopes,
    monthlyLimitUSDC: params.monthlyLimitUSDC ?? null,
    createdAt: new Date().toISOString(),
    usage: {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUSDC: 0,
    },
  };

  const store = await loadApiKeyStore(storePath);
  store.keys.push(record);
  await saveApiKeyStore(storePath, store);

  const { keyHash: _keyHash, ...safeRecord } = record;
  return { apiKey: secret, record: safeRecord };
}

export async function validateLocalApiKey(
  storePath: string,
  apiKey: string,
  requiredScopes: string[] = ["inference:write"],
  signingSecret?: string,
): Promise<LocalApiKeyRecord | null> {
  if (signingSecret) {
    const signed = verifySignedApiKey(apiKey, signingSecret);
    if (signed && requiredScopes.every((scope) => signed.scopes.includes(scope))) {
      return {
        id: signed.id,
        keyPrefix: apiKey.slice(0, 17),
        keyHash: hashApiKey(apiKey),
        name: "signed holder key",
        walletAddress: signed.walletAddress,
        ownerUserId: signed.ownerUserId ?? null,
        ownerAuthProvider: signed.ownerAuthProvider ?? null,
        ownerTokenType: signed.ownerTokenType ?? null,
        holderTier: signed.holderTier,
        scopes: signed.scopes,
        monthlyLimitUSDC: signed.monthlyLimitUSDC ?? null,
        createdAt: signed.issuedAt,
        usage: {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUSDC: 0,
        },
      };
    }
  }

  const store = await loadApiKeyStore(storePath);
  const keyHash = hashApiKey(apiKey);
  const record = store.keys.find((candidate) => candidate.keyHash === keyHash && !candidate.revokedAt);
  if (!record) return null;
  if (requiredScopes.some((scope) => !record.scopes.includes(scope))) return null;
  return record;
}

export async function recordLocalApiKeyUsage(
  storePath: string,
  keyId: string,
  usage: { inputTokens: number; outputTokens: number; costUSDC: number },
  meta?: Pick<LocalApiKeyRecord, "keyPrefix" | "walletAddress" | "ownerUserId" | "ownerAuthProvider" | "ownerTokenType" | "holderTier" | "scopes" | "monthlyLimitUSDC">,
): Promise<void> {
  const store = await loadApiKeyStore(storePath);
  let record = store.keys.find((candidate) => candidate.id === keyId);
  if (!record) {
    record = {
      id: keyId,
      keyPrefix: meta?.keyPrefix ?? keyId,
      keyHash: "",
      name: "signed holder key",
      walletAddress: meta?.walletAddress ?? "",
      ownerUserId: meta?.ownerUserId ?? null,
      ownerAuthProvider: meta?.ownerAuthProvider ?? null,
      ownerTokenType: meta?.ownerTokenType ?? null,
      holderTier: meta?.holderTier ?? "HOLDER",
      scopes: meta?.scopes ?? ["inference:write", "usage:read"],
      monthlyLimitUSDC: meta?.monthlyLimitUSDC ?? null,
      createdAt: new Date().toISOString(),
      usage: {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUSDC: 0,
      },
    };
    store.keys.push(record);
  }
  record.lastUsedAt = new Date().toISOString();
  record.usage.requests += 1;
  record.usage.inputTokens += usage.inputTokens;
  record.usage.outputTokens += usage.outputTokens;
  record.usage.costUSDC += usage.costUSDC;
  await saveApiKeyStore(storePath, store);
}

export async function listLocalApiKeys(storePath: string): Promise<Array<Omit<LocalApiKeyRecord, "keyHash">>> {
  const store = await loadApiKeyStore(storePath);
  return store.keys.map(({ keyHash: _keyHash, ...record }) => record);
}

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

type SignedApiKeyPayload = {
  id: string;
  walletAddress: string;
  ownerUserId?: string | null;
  ownerAuthProvider?: string | null;
  ownerTokenType?: string | null;
  holderTier: ClawdHolderTier;
  scopes: string[];
  issuedAt: string;
  monthlyLimitUSDC?: number | null;
};

function signApiKey(payload: SignedApiKeyPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `clawd_sk_${encoded}.${signature}`;
}

function verifySignedApiKey(apiKey: string, secret: string): SignedApiKeyPayload | null {
  const token = apiKey.replace(/^clawd_sk_/, "");
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SignedApiKeyPayload;
    if (!payload.id || !payload.walletAddress || !payload.holderTier || !Array.isArray(payload.scopes)) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function loadApiKeyStore(storePath: string): Promise<ApiKeyStoreFile> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as ApiKeyStoreFile;
    return { version: 1, keys: Array.isArray(parsed.keys) ? parsed.keys : [] };
  } catch {
    return { version: 1, keys: [] };
  }
}

async function saveApiKeyStore(storePath: string, store: ApiKeyStoreFile): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}
