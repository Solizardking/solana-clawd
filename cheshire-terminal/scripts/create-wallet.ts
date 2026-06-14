#!/usr/bin/env tsx
/**
 * Wallet Create - Generate a new Solana keypair
 * Usage: pnpm tsx scripts/create-wallet.ts [--save]
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';

interface WalletOutput {
  publicKey: string;
  secretKey: number[];
  secretKeyBase58: string;
}

function createWallet(): WalletOutput {
  const keypair = Keypair.generate();
  const secretKeyArray = Array.from(keypair.secretKey);
  const secretKeyBase58 = bs58.encode(keypair.secretKey);

  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: secretKeyArray,
    secretKeyBase58,
  };
}

function main() {
  const args = process.argv.slice(2);
  const shouldSave = args.includes('--save') || args.includes('-s');

  const wallet = createWallet();

  console.log('\n🔑 New Solana Wallet Created\n');
  console.log('Public Key (Address):');
  console.log(wallet.publicKey);
  console.log('\nSecret Key (for SOLANA_PRIVATE_KEY in .env as JSON array):');
  console.log(JSON.stringify(wallet.secretKey));
  console.log('\nSecret Key (Base58):');
  console.log(wallet.secretKeyBase58);
  console.log('\n⚠️  Store this securely. Never commit private keys to git.\n');

  if (shouldSave) {
    const outDir = path.join(process.cwd(), 'wallets');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const filename = `wallet-${wallet.publicKey.slice(0, 8)}.json`;
    const filepath = path.join(outDir, filename);
    fs.writeFileSync(
      filepath,
      JSON.stringify(
        {
          publicKey: wallet.publicKey,
          secretKey: wallet.secretKey,
        },
        null,
        2
      )
    );
    console.log(`💾 Saved to: ${filepath}\n`);
  }
}

main();
