// @ts-nocheck
import { Router } from 'express';
import type { Request, Response } from 'express';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  keypairIdentity,
  publicKey as umiPublicKey,
  generateSigner,
} from '@metaplex-foundation/umi';
import {
  mplAgentIdentity,
  mplAgentTools,
  mintAndSubmitAgent,
  registerIdentityV1,
  safeFetchAgentIdentityV1FromSeeds,
  safeFetchAgentIdentityV2FromSeeds,
  setAgentTokenV1,
  registerExecutiveV1,
  delegateExecutionV1,
} from '@metaplex-foundation/mpl-agent-registry';
import { mplCore, fetchAsset, create, findAssetSignerPda } from '@metaplex-foundation/mpl-core';
import bs58 from 'bs58';
import { rateLimit } from '../lib/rate-limit';
import { buildLaunchTokenTransaction } from '../lib/dbc/index';
import {
  deriveMetaplexCoreAssetSignerPda,
  requireDefaultDbcConfigAddress,
  resolveDbcFeeWallet,
} from '../lib/launchpad/fee-wallet';
import {
  LaunchKind,
  deriveCheshireAgentProfilePda,
  getConfiguredCheshireLaunchpadProgramId,
} from '../lib/launchpad/registry';

function shortAddr(a: string) {
  return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

const router = Router();

const freeMintLimiter = rateLimit({
  namespace: 'metaplex-agents:free-mint',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many free agent mints. Please try again later.',
});

const freeRegisterLimiter = rateLimit({
  namespace: 'metaplex-agents:free-register',
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many free agent registrations. Please try again later.',
});

const agentTokenLaunchLimiter = rateLimit({
  namespace: 'metaplex-agents:launch-token',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many agent token launch attempts. Please try again later.',
});

function isValidPubkey(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function signatureToBase64(signature: Uint8Array | number[] | string | undefined) {
  if (!signature) return '';
  if (typeof signature === 'string') return signature;
  return Buffer.from(signature).toString('base64');
}

function documentToUri(value: unknown) {
  if (!value || typeof value !== 'string') return undefined;
  if (/^(https:\/\/|data:)/.test(value)) return value;
  return `data:text/plain;base64,${Buffer.from(value).toString('base64')}`;
}

function buildUmi() {
  const rpcUrl =
    process.env.HELIUS_RPC_URL ||
    (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : undefined) ||
    process.env.SOLANA_RPC_URL;
  if (!rpcUrl) throw new Error('HELIUS_RPC_URL not configured');

  const umi = createUmi(rpcUrl)
    .use(mplCore())
    .use(mplAgentIdentity())
    .use(mplAgentTools());

  const rawKey =
    process.env.FEE_PAYER_SECRET_KEY ||
    process.env.WALLET_PRIVATE_KEY ||
    process.env.SOLANA_PRIVATE_KEY;
  if (rawKey) {
    try {
      let secretKey: Uint8Array;
      if (rawKey.startsWith('[')) {
        secretKey = new Uint8Array(JSON.parse(rawKey));
      } else {
        secretKey = bs58.decode(rawKey);
      }
      const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
      umi.use(keypairIdentity(keypair));
    } catch (e) {
      console.warn('Could not load WALLET_PRIVATE_KEY:', e);
    }
  }

  return umi;
}

// Build a valid ERC-8004 registration document and upload to data URI
function buildErc8004Doc(opts: {
  name: string;
  description: string;
  agentType: string;
  personality: string;
  capabilities: string[];
  imageUri?: string;
  assetAddress?: string;
}) {
  const doc = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: opts.name,
    description: opts.description || `${opts.agentType} AI agent — ${opts.personality} personality`,
    image: opts.imageUri || 'https://clawd.io/agent-default.png',
    services: [
      {
        name: 'web',
        endpoint: `https://clawd.io/agent/${opts.assetAddress || 'pending'}`,
      },
      {
        name: 'A2A',
        endpoint: `https://clawd.io/agent/${opts.assetAddress || 'pending'}/agent-card.json`,
        version: '0.3.0',
      },
    ],
    active: true,
    registrations: opts.assetAddress
      ? [{ agentId: opts.assetAddress, agentRegistry: 'solana:101:metaplex' }]
      : [],
    supportedTrust: ['reputation', 'crypto-economic'],
    properties: {
      agentType: opts.agentType,
      personality: opts.personality,
      capabilities: opts.capabilities,
      platform: 'CLAWD Terminal',
    },
  };
  // Encode as data URI (in production, upload to Arweave/IPFS)
  return `data:application/json;base64,${Buffer.from(JSON.stringify(doc)).toString('base64')}`;
}

// GET /api/metaplex-agents/health
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const rpcUrl =
      process.env.HELIUS_RPC_URL ||
      (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : undefined) ||
      process.env.SOLANA_RPC_URL;
    const hasKey = !!(process.env.FEE_PAYER_SECRET_KEY || process.env.WALLET_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY);
    const umi = buildUmi();
    const slot = await umi.rpc.getSlot();
    return res.json({
      success: true,
      rpcConfigured: !!rpcUrl,
      walletConfigured: hasKey,
      currentSlot: slot,
      network: rpcUrl?.includes('mainnet') ? 'mainnet-beta' : 'devnet',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Helius RPC health check failed',
    });
  }
});

// POST /api/metaplex-agents/mint
// Creates a Core NFT and registers as agent via Metaplex API in one call
async function mintAgentHandler(req: Request, res: Response) {
  try {
    const {
      name,
      symbol,
      description,
      agentType,
      personality,
      capabilities,
      imageUri,
      customRegistrationUri,
      agentRegistrationUri,
      registrationDoc,
      ownerPubkey,
      ownerAddress,
    } = req.body;

    if (!name || !agentType) {
      return res.status(400).json({ error: 'name and agentType are required' });
    }
    const owner = ownerPubkey || ownerAddress;
    if (owner && !isValidPubkey(owner)) {
      return res.status(400).json({ error: 'ownerPubkey must be a valid Solana public key' });
    }

    const umi = buildUmi();

    // Build NFT metadata URI
    const metadataJson = {
      name,
      symbol: symbol || 'AGENT',
      description: description || `${agentType} AI agent on Solana`,
      image: imageUri || 'https://clawd.io/agent-default.png',
      attributes: [
        { trait_type: 'Agent Type', value: agentType },
        { trait_type: 'Personality', value: personality || 'neutral' },
        { trait_type: 'Capabilities', value: (capabilities || []).join(', ') },
        { trait_type: 'Platform', value: 'CLAWD Terminal' },
      ],
    };
    const nftUri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadataJson)).toString('base64')}`;

    // Build ERC-8004 registration document URI
    const registrationUri =
      customRegistrationUri ||
      agentRegistrationUri ||
      documentToUri(registrationDoc) ||
      buildErc8004Doc({
        name,
        description: description || '',
        agentType,
        personality: personality || 'neutral',
        capabilities: capabilities || [],
        imageUri,
      });

    // Gasless path: the platform wallet pays transaction fees and remains the
    // update authority, while the connected user wallet receives the asset.
    if (owner) {
      const assetSigner = generateSigner(umi);
      const { signature: mintSignature } = await create(umi, {
        asset: assetSigner,
        name,
        uri: nftUri,
        owner: umiPublicKey(owner),
        updateAuthority: umi.identity.publicKey,
      }).sendAndConfirm(umi, {
        confirm: { commitment: 'confirmed' },
      });

      let registerSignature = '';
      let registrationError: string | undefined;
      try {
        const { signature } = await registerIdentityV1(umi, {
          asset: assetSigner.publicKey,
          authority: umi.identity,
          agentRegistrationUri: registrationUri,
        }).sendAndConfirm(umi, {
          confirm: { commitment: 'confirmed' },
        });
        registerSignature = signatureToBase64(signature);
      } catch (error: any) {
        registrationError = error?.message || String(error);
      }

      return res.status(201).json({
        success: !registrationError,
        gasless: true,
        assetAddress: String(assetSigner.publicKey),
        owner,
        payer: String(umi.identity.publicKey),
        signature: signatureToBase64(mintSignature),
        mintSignature: signatureToBase64(mintSignature),
        registerSignature,
        registrationError,
        explorerUrl: `https://explorer.solana.com/address/${assetSigner.publicKey}`,
        solscanUrl: `https://solscan.io/token/${assetSigner.publicKey}`,
        nftUri,
        registrationUri,
      });
    }

    // mintAndSubmitAgent(umi, config, input) — calls Metaplex API
    const result = await mintAndSubmitAgent(umi, {}, {
      name,
      uri: nftUri,
      registrationDoc: registrationDoc || registrationUri,
    });

    return res.json({
      success: true,
      assetAddress: result.assetAddress,
      signature: Buffer.from(result.signature || new Uint8Array()).toString('base64'),
      explorerUrl: `https://explorer.solana.com/address/${result.assetAddress}`,
      solscanUrl: `https://solscan.io/token/${result.assetAddress}`,
      nftUri,
      registrationUri,
    });
  } catch (error: any) {
    console.error('Error minting Metaplex agent:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to mint agent',
      details: String(error),
    });
  }
}

router.post('/mint', freeMintLimiter, mintAgentHandler);
router.post('/agent', freeMintLimiter, mintAgentHandler);

// POST /api/metaplex-agents/register
// Register AgentIdentityV1 PDA for an existing Core asset — uses agentRegistrationUri (ERC-8004)
router.post('/register', freeRegisterLimiter, async (req: Request, res: Response) => {
  try {
    const {
      assetAddress,
      agentRegistrationUri,
      registrationDoc,
      // convenience fields to auto-build the ERC-8004 doc
      name,
      description,
      agentType,
      personality,
      capabilities,
      imageUri,
      collectionAddress,
    } = req.body;

    if (!assetAddress) {
      return res.status(400).json({ error: 'assetAddress is required' });
    }
    if (!isValidPubkey(assetAddress)) {
      return res.status(400).json({ error: 'assetAddress must be a valid Solana public key' });
    }

    const umi = buildUmi();
    const asset = umiPublicKey(assetAddress);

    // Use provided URI or auto-build ERC-8004 doc
    const regUri =
      agentRegistrationUri ||
      documentToUri(registrationDoc) ||
      buildErc8004Doc({
        name: name || 'Unnamed Agent',
        description: description || '',
        agentType: agentType || 'general',
        personality: personality || 'neutral',
        capabilities: capabilities || [],
        imageUri,
        assetAddress,
      });

    const txBuilder = registerIdentityV1(umi, {
      asset,
      ...(collectionAddress ? { collection: umiPublicKey(collectionAddress) } : {}),
      agentRegistrationUri: regUri,
    });

    const { signature } = await txBuilder.sendAndConfirm(umi, {
      confirm: { commitment: 'confirmed' },
    });

    return res.json({
      success: true,
      assetAddress,
      agentRegistrationUri: regUri,
      signature: signatureToBase64(signature),
      gasless: true,
      payer: String(umi.identity.publicKey),
    });
  } catch (error: any) {
    console.error('Error registering agent identity:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to register agent identity',
      details: String(error),
    });
  }
});

// GET /api/metaplex-agents/fetch/:assetAddress
// Read Core asset + AgentIdentityV1 + AgentIdentity plugin
router.get('/fetch/:assetAddress', async (req: Request, res: Response) => {
  try {
    const { assetAddress } = req.params;
    if (!assetAddress) {
      return res.status(400).json({ error: 'assetAddress is required' });
    }

    const umi = buildUmi();
    const assetPk = umiPublicKey(assetAddress);

    let assetData: any = null;
    let pluginData: any = null;
    try {
      const asset = await fetchAsset(umi, assetPk);
      assetData = {
        name: asset.name,
        uri: asset.uri,
        owner: String(asset.owner),
        updateAuthority: String((asset.updateAuthority as any)?.address || asset.updateAuthority),
      };
      // Check for AgentIdentity plugin on the Core asset
      const agentPlugin = (asset as any).agentIdentities?.[0];
      if (agentPlugin) {
        pluginData = {
          uri: agentPlugin.uri,
          lifecycleChecks: agentPlugin.lifecycleChecks,
        };
      }
    } catch (e) {
      console.warn('Could not fetch Core asset:', e);
    }

    // Also try the AgentIdentity PDA derived from the asset.
    let identityData: any = null;
    try {
      const identityV2 = await safeFetchAgentIdentityV2FromSeeds(umi, { asset: assetPk });
      const identity = identityV2 || await safeFetchAgentIdentityV1FromSeeds(umi, { asset: assetPk });
      const [agentWallet] = findAssetSignerPda(umi, { asset: assetPk });
      if (identity) {
        identityData = {
          version: identityV2 ? 'v2' : 'v1',
          agentRegistrationUri: pluginData?.uri || (identity as any).agentMetadataUri || (identity as any).agentRegistrationUri || (identity as any).registrationDoc,
          wallet: String(agentWallet),
          agentToken: (identity as any).agentToken ? String((identity as any).agentToken) : null,
        };
      }
    } catch (e) {
      console.warn('Could not fetch agent identity PDA:', e);
    }

    if (!assetData && !identityData) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    return res.json({
      success: true,
      assetAddress,
      asset: assetData,
      plugin: pluginData,
      identity: identityData,
      isRegisteredAgent: !!(pluginData || identityData),
      explorerUrl: `https://explorer.solana.com/address/${assetAddress}`,
    });
  } catch (error: any) {
    console.error('Error fetching agent:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to fetch agent',
      details: String(error),
    });
  }
});

// POST /api/metaplex-agents/launch-token
// Builds a public DBC launch transaction for the agent owner to sign.
router.post('/launch-token', agentTokenLaunchLimiter, async (req: Request, res: Response) => {
  try {
    const {
      assetAddress,
      tokenName,
      tokenSymbol,
      tokenUri,
      configAddress,
      userWallet,
      creatorFeeWallet,
    } = req.body;

    if (!assetAddress || !tokenName || !tokenSymbol) {
      return res.status(400).json({ error: 'assetAddress, tokenName, and tokenSymbol are required' });
    }
    if (!isValidPubkey(assetAddress)) {
      return res.status(400).json({ error: 'assetAddress must be a valid Solana public key' });
    }
    if (userWallet && !isValidPubkey(userWallet)) {
      return res.status(400).json({ error: 'userWallet must be a valid Solana public key' });
    }

    const symbol = String(tokenSymbol).trim().toUpperCase();
    if (!symbol || symbol.length > 10) {
      return res.status(400).json({ error: 'tokenSymbol must be 1-10 characters' });
    }

    const umi = buildUmi();
    const asset = await fetchAsset(umi, umiPublicKey(assetAddress));
    const ownerWallet = String(asset.owner);
    const launchSigner = userWallet || ownerWallet;
    if (launchSigner !== ownerWallet) {
      return res.status(400).json({
        error: 'Connected wallet must own the agent asset before launching its token.',
        ownerWallet,
      });
    }

    const dbcConfig = requireDefaultDbcConfigAddress(configAddress);
    const protocolFeeWallet = resolveDbcFeeWallet();
    const registryProgram = getConfiguredCheshireLaunchpadProgramId();
    const registryAgentProfile = registryProgram
      ? deriveCheshireAgentProfilePda(ownerWallet, assetAddress, registryProgram.publicKey)
      : null;
    const resolvedCreatorFeeWallet = creatorFeeWallet && isValidPubkey(creatorFeeWallet)
      ? creatorFeeWallet
      : deriveMetaplexCoreAssetSignerPda(assetAddress).toBase58();

    const metadataUri = tokenUri || asset.uri || buildErc8004Doc({
      name: String(tokenName).trim(),
      description: `${symbol} agent token launch`,
      agentType: 'token-launch',
      personality: 'neutral',
      capabilities: ['token launch'],
      assetAddress,
    });

    const launch = await buildLaunchTokenTransaction({
      name: String(tokenName).trim(),
      symbol,
      uri: metadataUri,
      configAddress: dbcConfig.publicKey.toBase58(),
      userWallet: launchSigner,
      launchRegistry: {
        enabled: true,
        launchKind: LaunchKind.AgentToken,
        agentProfile: registryAgentProfile,
      },
      clawdAgentBinding: {
        enabled: true,
        agentWallet: launchSigner,
        authority: launchSigner,
        character: {
          assetAddress,
          tokenName: String(tokenName).trim(),
          tokenSymbol: symbol,
          tokenUri: metadataUri,
        },
      },
    });

    return res.json({
      success: true,
      requiresSignature: true,
      assetAddress,
      ownerWallet,
      userWallet: launchSigner,
      transaction: launch.transaction,
      mintAddress: launch.mintAddress,
      poolAddress: launch.poolAddress,
      genesisAccount: launch.poolAddress,
      launchRegistry: launch.launchRegistry,
      clawdAgentBinding: launch.clawdAgentBinding,
      configAddress: dbcConfig.publicKey.toBase58(),
      configSource: dbcConfig.source,
      protocolFeeWallet: protocolFeeWallet.publicKey.toBase58(),
      protocolFeeWalletSource: protocolFeeWallet.source,
      creatorFeeWallet: resolvedCreatorFeeWallet,
      agentTokenLink: {
        status: 'pending_user_signature',
        endpoint: '/api/metaplex-agents/set-token',
        genesisAccount: launch.poolAddress,
      },
      solscanUrl: `https://solscan.io/token/${launch.mintAddress}`,
    });
  } catch (error: any) {
    console.error('Error building agent token launch:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to build agent token launch',
      details: String(error),
    });
  }
});

// POST /api/metaplex-agents/set-token — link a Genesis token mint to the agent
router.post('/set-token', async (req: Request, res: Response) => {
  try {
    const { assetAddress, genesisAccount } = req.body;
    if (!assetAddress || !genesisAccount) {
      return res.status(400).json({ error: 'assetAddress and genesisAccount are required' });
    }

    const umi = buildUmi();
    const asset = umiPublicKey(assetAddress);
    const genesis = umiPublicKey(genesisAccount);

    const { signature } = await setAgentTokenV1(umi, {
      asset,
      genesisAccount: genesis,
    }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

    return res.json({
      success: true,
      assetAddress,
      genesisAccount,
      signature: Buffer.from(signature).toString('base64'),
    });
  } catch (error: any) {
    console.error('Error setting agent token:', error);
    return res.status(500).json({ error: error?.message || 'Failed to set agent token' });
  }
});

// POST /api/metaplex-agents/register-executive
router.post('/register-executive', async (req: Request, res: Response) => {
  try {
    const { assetAddress, executiveDoc } = req.body;
    if (!assetAddress || !executiveDoc) {
      return res.status(400).json({ error: 'assetAddress and executiveDoc are required' });
    }

    const umi = buildUmi();
    const asset = umiPublicKey(assetAddress);

    const { signature } = await registerExecutiveV1(umi, {
      asset,
      executiveDoc,
    }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

    return res.json({
      success: true,
      assetAddress,
      signature: Buffer.from(signature).toString('base64'),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to register executive' });
  }
});

// POST /api/metaplex-agents/delegate
router.post('/delegate', async (req: Request, res: Response) => {
  try {
    const { assetAddress, delegateAddress } = req.body;
    if (!assetAddress || !delegateAddress) {
      return res.status(400).json({ error: 'assetAddress and delegateAddress are required' });
    }

    const umi = buildUmi();
    const asset = umiPublicKey(assetAddress);
    const delegate = umiPublicKey(delegateAddress);

    const { signature } = await delegateExecutionV1(umi, {
      asset,
      delegate,
    }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

    return res.json({
      success: true,
      assetAddress,
      delegateAddress,
      signature: Buffer.from(signature).toString('base64'),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to delegate execution' });
  }
});

export default router;
