import { Connection, clusterApiUrl } from '@solana/web3.js';
import { resolveBrowserRpcUrl } from './runtimeConfig';

// Configuration for Solana blockchain (mainnet)
const RPC_URL = resolveBrowserRpcUrl() || clusterApiUrl('mainnet-beta');

// Configuration for Base blockchain
export const CROSSMINT_CLIENT_API_KEY = import.meta.env.VITE_CROSSMINT_CLIENT_API_KEY;
export const BASE_CHAIN_ID = 8453; // Base mainnet chain ID

export const createConnection = () => {
  return new Connection(RPC_URL, {
    commitment: 'confirmed',
    wsEndpoint: RPC_URL.startsWith('https://') ? RPC_URL.replace('https://', 'wss://') : undefined,
  });
};

export const NETWORK = 'mainnet-beta';

// Multi-chain config
export enum BlockchainType {
  SOLANA = 'solana',
  BASE = 'base'
}

export const DEFAULT_BLOCKCHAIN = BlockchainType.SOLANA;
