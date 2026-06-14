import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplAgentIdentity } from '@metaplex-foundation/mpl-agent-registry';

export const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=1771237b-e3a5-49cb-b190-af95b2113788';
export const SOLANA_RPC = HELIUS_RPC || clusterApiUrl('mainnet-beta');

export const CLAWD_MINT_ADDRESS = new PublicKey('8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump');
export const CLAWD_MINT_STR = '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';
export const CLAWD_DECIMALS = 6;

export const LOBSTER_GACHA_AGENT_NAME = 'Lobster Gacha Agent';
export const LOBSTER_GACHA_COLLECTION_NAME = 'Lobster Gacha Prize Collection';

let _connection: Connection | null = null;

export function getSolanaConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(SOLANA_RPC, 'confirmed');
  }
  return _connection;
}

export function buildUmi(walletAdapter?: { publicKey: PublicKey; signTransaction: unknown; signAllTransactions: unknown }) {
  const umi = createUmi(SOLANA_RPC)
    .use(mplCore())
    .use(mplAgentIdentity());

  if (walletAdapter) {
    // walletAdapterIdentity is applied by the caller
  }

  return umi;
}
