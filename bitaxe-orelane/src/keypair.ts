import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface KeypairSource {
  keypairPath?: string;
  keypairBase58?: string;
}

function loadKeypairFile(keypairPath: string): Keypair {
  const raw = JSON.parse(readFileSync(keypairPath, 'utf-8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function parseBase58Keypair(secret: string): Keypair {
  const decoded = bs58.decode(secret.trim());
  if (decoded.length === 64) {
    return Keypair.fromSecretKey(decoded);
  }
  if (decoded.length === 32) {
    return Keypair.fromSeed(decoded);
  }
  throw new Error(`Unsupported base58 keypair length: ${decoded.length}`);
}

export function loadKeypair(source: KeypairSource): Keypair | null {
  if (source.keypairPath && existsSync(source.keypairPath)) {
    return loadKeypairFile(source.keypairPath);
  }
  if (source.keypairBase58) {
    return parseBase58Keypair(source.keypairBase58);
  }
  return null;
}

export function ensureKeypairPath(source: KeypairSource): string | null {
  if (source.keypairPath && existsSync(source.keypairPath)) {
    return source.keypairPath;
  }
  if (!source.keypairBase58) {
    return null;
  }

  const keypair = parseBase58Keypair(source.keypairBase58);
  const tempPath = join(tmpdir(), `bitaxe-orelane-${keypair.publicKey.toBase58()}.keypair.json`);
  writeFileSync(tempPath, JSON.stringify(Array.from(keypair.secretKey)));
  chmodSync(tempPath, 0o600);
  return tempPath;
}
