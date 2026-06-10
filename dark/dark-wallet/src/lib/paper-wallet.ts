import { Keypair } from "@solana/web3.js";
import type { DarkNetwork } from "./runtime";

export interface SolanaPaperWallet {
  label: string;
  network: DarkNetwork;
  createdAt: number;
  publicKey: string;
  secretKey: number[];
  secretKeyJson: string;
  seedFingerprint: string;
  publicFingerprint: string;
  entropyNote: string;
}

export interface SolanaPaperWalletOptions {
  label?: string;
  network?: DarkNetwork;
  entropy?: string;
}

const textEncoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
    return bytes;
  }

  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  return bytes;
}

function fallbackDigest(bytes: Uint8Array): Uint8Array {
  let state = 0x811c9dc5;
  for (const byte of bytes) {
    state ^= byte;
    state = Math.imul(state, 0x01000193);
  }

  const digest = new Uint8Array(32);
  for (let index = 0; index < digest.length; index += 1) {
    const rotated = (state >>> (index % 24)) ^ (state << ((index + 7) % 24));
    digest[index] = rotated & 0xff;
    state = Math.imul(state ^ rotated, 0x45d9f3b);
  }

  return digest;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const digest = await crypto.subtle.digest("SHA-256", source);
    return new Uint8Array(digest);
  }

  return fallbackDigest(bytes);
}

async function deriveSeed(
  label: string,
  network: DarkNetwork,
  entropy: string,
): Promise<Uint8Array> {
  const randomSalt = randomBytes(32);
  const payload = textEncoder.encode([
    "dark-wallet-paper",
    label,
    network,
    entropy.trim(),
    bytesToHex(randomSalt),
    Date.now().toString(16),
  ].join("\n"));

  return (await sha256(payload)).slice(0, 32);
}

function fingerprint(bytes: Uint8Array, length = 12): string {
  return bytesToHex(bytes).slice(0, length).toUpperCase();
}

function normalizeLabel(label?: string): string {
  const trimmed = label?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Dark Solana paper wallet";
}

export async function generateSolanaPaperWallet(
  options: SolanaPaperWalletOptions = {},
): Promise<SolanaPaperWallet> {
  const label = normalizeLabel(options.label);
  const network = options.network ?? "devnet";
  const entropy = options.entropy?.trim() ?? "";
  const seed = await deriveSeed(label, network, entropy);
  const keypair = Keypair.fromSeed(seed);
  const secretKey = Array.from(keypair.secretKey);
  const secretKeyJson = JSON.stringify(secretKey, null, 2);
  const publicKeyBytes = keypair.publicKey.toBytes();

  return {
    label,
    network,
    createdAt: Date.now(),
    publicKey: keypair.publicKey.toBase58(),
    secretKey,
    secretKeyJson,
    seedFingerprint: fingerprint(seed),
    publicFingerprint: fingerprint(publicKeyBytes),
    entropyNote: entropy ? "custom entropy + local randomness" : "local randomness only",
  };
}

export function serializeSolanaPaperWallet(wallet: SolanaPaperWallet): string {
  return JSON.stringify(wallet, null, 2);
}

export function paperWalletFileName(wallet: SolanaPaperWallet): string {
  const slug = wallet.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "dark-solana-paper-wallet"}-${wallet.network}.json`;
}

export function summarisePaperWallet(wallet: SolanaPaperWallet): string {
  return [
    `Label: ${wallet.label}`,
    `Network: ${wallet.network}`,
    `Public key: ${wallet.publicKey}`,
    `Seed fingerprint: ${wallet.seedFingerprint}`,
    `Public fingerprint: ${wallet.publicFingerprint}`,
  ].join("\n");
}
