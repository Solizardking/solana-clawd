// Metaplex Core NFT minting + Agent registry (registerIdentityV1 flow)
// Docs: https://developers.metaplex.com/agents/register-an-agent
import { create, fetchAsset, findAssetSignerPda } from '@metaplex-foundation/mpl-core';
import {
  findAgentIdentityV1Pda,
  fetchAgentIdentityV1FromSeeds,
  safeFetchAgentIdentityV1,
  registerIdentityV1,
  mplAgentIdentity,
} from '@metaplex-foundation/mpl-agent-registry';
import { generateSigner, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { LOBSTER_GACHA_AGENT_NAME, SOLANA_RPC } from './connection';
import type { GachaPrize } from './prizes';

export interface MintedNFT {
  assetAddress: string;
  signature: string;
  tier: string;
  uri: string;
}

export interface AgentRegistration {
  assetAddress: string;
  identitySignature: string;
  agentWallet: string;
  identityPda: string;
}

export interface AgentIdentityStatus {
  registered: boolean;
  uri?: string;
  lifecycleChecks?: {
    transfer: boolean;
    update: boolean;
    execute: boolean;
  };
  assetSignerPda?: string;
  assetSignerBalance?: number;
}

// EIP-8004 registration document — hosted on Arweave
export const GACHA_AGENT_REGISTRATION_URI =
  'https://arweave.net/lobster-gacha-agent-registration-v1.json';

// EIP-8004 off-chain metadata — what counterparties fetch from the URI
export function buildAgentRegistrationDoc(assetPublicKey: string) {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: LOBSTER_GACHA_AGENT_NAME,
    description:
      'Autonomous Solana gacha machine agent — pulls capsules on-chain, mints Metaplex Core NFT prizes, vests CLAWD tokens via Streamflow, auto-hedges jackpots with Phoenix perps, and exposes machine-to-machine payment APIs (x402 / A2A / MCP).',
    image: 'https://arweave.net/lobster-gacha-avatar.png',
    services: [
      {
        name: 'web',
        endpoint: 'https://gacha.solanaclawd.com',
      },
      {
        name: 'A2A',
        endpoint: `https://gacha.solanaclawd.com/agent/${assetPublicKey}/agent-card.json`,
        version: '0.3.0',
        skills: ['gacha-pull', 'prize-mint', 'clawd-vest', 'perp-hedge', 'clawd-burn'],
        domains: ['gaming', 'defi', 'nft', 'agents'],
      },
      {
        name: 'MCP',
        endpoint: `https://gacha.solanaclawd.com/agent/${assetPublicKey}/mcp`,
        version: '2025-06-18',
      },
      {
        name: 'gacha',
        endpoint: 'https://gacha.solanaclawd.com/api/pull',
        skills: ['capsule-pull', 'prize-reveal', 'provably-fair'],
      },
      {
        name: 'vesting',
        endpoint: 'https://gacha.solanaclawd.com/api/vest',
        skills: ['clawd-stream', 'market-cap-unlock'],
      },
      {
        name: 'perps',
        endpoint: 'https://gacha.solanaclawd.com/api/perps',
        skills: ['phoenix-hedge', 'pnl-track'],
      },
    ],
    x402Support: true,
    active: true,
    registrations: [
      {
        agentId: assetPublicKey,
        agentRegistry: 'solana:101:metaplex',
      },
    ],
    supportedTrust: ['reputation', 'crypto-economic'],
  };
}

type WalletAdapter = Parameters<typeof walletAdapterIdentity>[0];

function buildUmi(walletAdapter: WalletAdapter) {
  return createUmi(SOLANA_RPC)
    .use(mplCore())
    .use(mplAgentIdentity())
    .use(walletAdapterIdentity(walletAdapter));
}

// ── Prize NFT ────────────────────────────────────────────────────────────────

export async function mintPrizeNFT(
  walletAdapter: WalletAdapter,
  prize: GachaPrize,
): Promise<MintedNFT> {
  const umi = buildUmi(walletAdapter);
  const assetSigner = generateSigner(umi);
  const nftName = `Lobster Gacha — ${prize.displayName}`;
  const nftUri = prize.nftUri ?? 'https://arweave.net/lobster-gacha-prize';

  const { signature } = await create(umi, {
    asset: assetSigner,
    name: nftName,
    uri: nftUri,
  }).sendAndConfirm(umi);

  return {
    assetAddress: assetSigner.publicKey.toString(),
    signature: Buffer.from(signature).toString('base64'),
    tier: prize.tier,
    uri: nftUri,
  };
}

// ── Agent Registration ────────────────────────────────────────────────────────
// Two-step: (1) create MPL Core asset, (2) bind AgentIdentity via registerIdentityV1

export async function registerGachaAgent(walletAdapter: WalletAdapter): Promise<AgentRegistration> {
  const umi = buildUmi(walletAdapter);

  // Step 1 — create Core asset
  const asset = generateSigner(umi);
  await create(umi, {
    asset,
    name: LOBSTER_GACHA_AGENT_NAME,
    uri: 'https://arweave.net/lobster-gacha-agent-metadata.json',
  }).sendAndConfirm(umi);

  // Step 2 — register identity (attaches AgentIdentity plugin + creates PDA)
  const { signature } = await registerIdentityV1(umi, {
    asset: asset.publicKey,
    agentRegistrationUri: GACHA_AGENT_REGISTRATION_URI,
  }).sendAndConfirm(umi);

  const identityPda = findAgentIdentityV1Pda(umi, { asset: asset.publicKey });
  const [agentWalletPda] = findAssetSignerPda(umi, { asset: asset.publicKey });

  return {
    assetAddress: asset.publicKey.toString(),
    identitySignature: Buffer.from(signature).toString('base64'),
    agentWallet: agentWalletPda.toString(),
    identityPda: identityPda[0].toString(),
  };
}

// ── Identity Read ─────────────────────────────────────────────────────────────

export async function getAgentIdentity(assetAddress: string, walletAdapter: WalletAdapter) {
  const umi = buildUmi(walletAdapter);
  const assetKey = umiPublicKey(assetAddress);
  const pda = findAgentIdentityV1Pda(umi, { asset: assetKey });
  return safeFetchAgentIdentityV1(umi, pda);
}

export async function getAgentIdentityStatus(
  assetAddress: string,
  walletAdapter: WalletAdapter,
): Promise<AgentIdentityStatus> {
  const umi = buildUmi(walletAdapter);
  const assetKey = umiPublicKey(assetAddress);

  // Safe fetch — returns null if not registered
  let identity: Awaited<ReturnType<typeof fetchAgentIdentityV1FromSeeds>> | null;
  try {
    identity = await fetchAgentIdentityV1FromSeeds(umi, { asset: assetKey });
  } catch {
    identity = null;
  }

  if (!identity) {
    return { registered: false };
  }

  // Fetch asset to read AgentIdentity plugin
  let assetData: Awaited<ReturnType<typeof fetchAsset>> | null;
  try {
    assetData = await fetchAsset(umi, assetKey);
  } catch {
    assetData = null;
  }

  const plugin = (assetData as unknown as { agentIdentities?: Array<{ uri?: string; lifecycleChecks?: { transfer?: unknown; update?: unknown; execute?: unknown } }> })?.agentIdentities?.[0];
  const [signerPda] = findAssetSignerPda(umi, { asset: assetKey });
  const signerPdaStr = signerPda.toString();

  // Fetch PDA balance
  let signerBalance = 0;
  try {
    const lamports = await umi.rpc.getBalance(signerPda);
    signerBalance = Number(lamports.basisPoints) / 1e9;
  } catch { /* no balance */ }

  return {
    registered: true,
    uri: plugin?.uri,
    lifecycleChecks: {
      transfer: !!plugin?.lifecycleChecks?.transfer,
      update: !!plugin?.lifecycleChecks?.update,
      execute: !!plugin?.lifecycleChecks?.execute,
    },
    assetSignerPda: signerPdaStr,
    assetSignerBalance: signerBalance,
  };
}

// ── Asset Signer PDA ──────────────────────────────────────────────────────────

export function deriveAgentWallet(assetAddress: string, walletAdapter: WalletAdapter): string {
  const umi = buildUmi(walletAdapter);
  const assetKey = umiPublicKey(assetAddress);
  const [pda] = findAssetSignerPda(umi, { asset: assetKey });
  return pda.toString();
}

// ── Asset Fetch ───────────────────────────────────────────────────────────────

export async function fetchPrizeAsset(assetAddress: string, walletAdapter: WalletAdapter) {
  const umi = buildUmi(walletAdapter);
  return fetchAsset(umi, umiPublicKey(assetAddress));
}
