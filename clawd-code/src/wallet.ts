import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { Keypair } from '@solana/web3.js';

const WALLET_DIR = join(homedir(), '.clawd-code', 'wallets');

export type WalletRecord = {
  name: string;
  publicKey: string;
  path: string;
};

function ensureWalletDir(): void {
  mkdirSync(WALLET_DIR, { recursive: true, mode: 0o700 });
  chmodSync(WALLET_DIR, 0o700);
}

function walletPath(name: string): string {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '-');
  return join(WALLET_DIR, `${safeName}.json`);
}

export function createWallet(name = 'default'): WalletRecord {
  ensureWalletDir();

  const path = walletPath(name);
  if (existsSync(path)) {
    throw new Error(`Wallet already exists: ${path}`);
  }

  const keypair = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)));
  chmodSync(path, 0o600);

  return {
    name,
    publicKey: keypair.publicKey.toBase58(),
    path,
  };
}

export function listWallets(): WalletRecord[] {
  ensureWalletDir();

  return readdirSync(WALLET_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const path = join(WALLET_DIR, file);
      const secret = Uint8Array.from(JSON.parse(readFileSync(path, 'utf-8')));
      const keypair = Keypair.fromSecretKey(secret);

      return {
        name: file.replace(/\.json$/, ''),
        publicKey: keypair.publicKey.toBase58(),
        path,
      };
    });
}
