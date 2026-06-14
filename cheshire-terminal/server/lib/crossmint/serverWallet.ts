/**
 * Server wallet helpers for getting Solana keypair for server operations
 */
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// The wallet private key will be used for signing StreamFlow transactions
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

/**
 * Gets the server wallet keypair
 * @returns The wallet Keypair for server operations
 */
export async function getWallet(): Promise<Keypair> {
  if (!WALLET_PRIVATE_KEY) {
    console.error('Missing WALLET_PRIVATE_KEY environment variable');
    throw new Error('Missing server wallet private key');
  }
  
  try {
    // Convert base58 private key to Keypair
    const decodedKey = bs58.decode(WALLET_PRIVATE_KEY);
    return Keypair.fromSecretKey(decodedKey);
  } catch (error: any) {
    console.error('Error creating wallet keypair:', error);
    throw new Error(`Failed to create wallet keypair: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Gets the wallet public key
 * @returns The wallet public key as a string
 */
export async function getWalletPublicKey(): Promise<string> {
  try {
    const keypair = await getWallet();
    return keypair.publicKey.toString();
  } catch (error: any) {
    console.error('Error getting wallet public key:', error);
    throw new Error(`Failed to get wallet public key: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Check if the server wallet is configured
 * @returns True if the wallet private key is available
 */
export function isWalletConfigured(): boolean {
  return !!WALLET_PRIVATE_KEY;
}