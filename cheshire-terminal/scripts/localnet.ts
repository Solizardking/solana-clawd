import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';

async function main() {
  // Connect to local Solana cluster
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Generate a new wallet if one doesn't exist
  let wallet: Keypair;
  if (!fs.existsSync('./id.json')) {
    wallet = Keypair.generate();
    fs.writeFileSync('./id.json', JSON.stringify(Array.from(wallet.secretKey)));
    console.log('Created new wallet:', wallet.publicKey.toString());
  } else {
    const secretKey = new Uint8Array(JSON.parse(fs.readFileSync('./id.json', 'utf-8')));
    wallet = Keypair.fromSecretKey(secretKey);
    console.log('Using existing wallet:', wallet.publicKey.toString());
  }

  // Request airdrop
  try {
    const signature = await connection.requestAirdrop(
      wallet.publicKey,
      10 * LAMPORTS_PER_SOL // Request 10 SOL
    );
    await connection.confirmTransaction(signature);
    console.log('Airdropped 10 SOL to wallet');

    // Get wallet balance
    const balance = await connection.getBalance(wallet.publicKey);
    console.log('Current balance:', balance / LAMPORTS_PER_SOL, 'SOL');
  } catch (error) {
    console.error('Failed to airdrop SOL:', error);
  }
}

main().catch(console.error);
