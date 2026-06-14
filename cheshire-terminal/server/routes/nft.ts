// @ts-nocheck
import { Router } from 'express';
import type { Request, Response } from 'express';
import { objectStore } from '../lib/objectStore';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  keypairIdentity,
  publicKey as umiPublicKey,
  generateSigner,
} from '@metaplex-foundation/umi';
import {
  mplCore,
  create,
  fetchAsset,
  update,
  transfer,
  burn,
  createCollection,
  fetchCollection,
} from '@metaplex-foundation/mpl-core';
import bs58 from 'bs58';
import { generateImage } from '../lib/xai/grok';

const router = Router();

function buildUmi(recipientAddress?: string) {
  const rpcUrl = process.env.HELIUS_RPC_URL;
  if (!rpcUrl) throw new Error('HELIUS_RPC_URL not configured');

  const umi = createUmi(rpcUrl).use(mplCore());

  const rawKey = process.env.WALLET_PRIVATE_KEY;
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

// POST /api/nft/generate-image
// Generate an AI image via xAI grok-imagine-image (site-wide default)
router.post('/generate-image', async (req: Request, res: Response) => {
  try {
    const { prompt, size = '1024x1024' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const aspect_ratio =
      size === '1024x1792' ? '9:16' :
      size === '1792x1024' ? '16:9' : '1:1';

    const fullPrompt = `${prompt} — pixel art NFT style, vibrant colors, Solana blockchain themed, lobster claw motif, CLAWD terminal aesthetic`;

    const results = await generateImage({ prompt: fullPrompt, n: 1, aspect_ratio, resolution: '2k' });
    const first = results[0];
    const imageUrl = first?.url || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : undefined);
    const revisedPrompt = first?.revisedPrompt;

    if (imageUrl) {
      const item = objectStore.makeItem({
        type: 'image', title: prompt, prompt, sourceUrl: imageUrl, model: 'grok-imagine-image',
        metadata: { source: 'nft-studio' },
      });
      objectStore.saveGalleryItem(item).then(saved => {
        const broadcast = req.app.locals.broadcastGalleryItem as Function | undefined;
        broadcast?.(saved);
      }).catch(() => {});
    }

    return res.json({ success: true, imageUrl, revisedPrompt, model: 'grok-imagine-image' });
  } catch (error: any) {
    console.error('Error generating image:', error);
    return res.status(500).json({ error: error?.message || 'Image generation failed' });
  }
});

// POST /api/nft/create
// Mint a new Metaplex Core NFT
router.post('/create', async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      imageUrl,
      attributes,
      ownerAddress,
      collectionAddress,
    } = req.body;

    if (!name || !imageUrl) {
      return res.status(400).json({ error: 'name and imageUrl are required' });
    }

    const umi = buildUmi();

    // Build off-chain metadata
    const metadata = {
      name,
      description: description || `A CLAWD NFT — ${name}`,
      image: imageUrl,
      attributes: attributes || [],
      properties: {
        category: 'image',
        creators: [{ address: String(umi.identity.publicKey), share: 100 }],
      },
    };
    const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;

    const assetSigner = generateSigner(umi);

    const createArgs: any = {
      asset: assetSigner,
      name,
      uri,
    };

    if (collectionAddress) {
      createArgs.collection = { publicKey: umiPublicKey(collectionAddress) };
    }

    // If owner is different from server wallet, set it
    if (ownerAddress && ownerAddress !== String(umi.identity.publicKey)) {
      createArgs.owner = umiPublicKey(ownerAddress);
    }

    const { signature } = await create(umi, createArgs).sendAndConfirm(umi, {
      confirm: { commitment: 'confirmed' },
    });

    return res.json({
      success: true,
      assetAddress: String(assetSigner.publicKey),
      name,
      uri,
      imageUrl,
      signature: Buffer.from(signature).toString('base64'),
      owner: ownerAddress || String(umi.identity.publicKey),
      explorerUrl: `https://explorer.solana.com/address/${assetSigner.publicKey}`,
      solscanUrl: `https://solscan.io/token/${assetSigner.publicKey}`,
    });
  } catch (error: any) {
    console.error('Error creating NFT:', error);
    return res.status(500).json({ error: error?.message || 'Failed to create NFT' });
  }
});

// GET /api/nft/fetch/:assetAddress
router.get('/fetch/:assetAddress', async (req: Request, res: Response) => {
  try {
    const { assetAddress } = req.params;
    const umi = buildUmi();
    const asset = await fetchAsset(umi, umiPublicKey(assetAddress));

    // Try to fetch off-chain metadata if URI is not a data URI
    let offchainMetadata: any = null;
    if (asset.uri && !asset.uri.startsWith('data:')) {
      try {
        const r = await fetch(asset.uri, { signal: AbortSignal.timeout(5000) });
        offchainMetadata = await r.json();
      } catch {}
    } else if (asset.uri?.startsWith('data:application/json;base64,')) {
      try {
        const b64 = asset.uri.replace('data:application/json;base64,', '');
        offchainMetadata = JSON.parse(Buffer.from(b64, 'base64').toString());
      } catch {}
    }

    return res.json({
      success: true,
      assetAddress,
      name: asset.name,
      uri: asset.uri,
      owner: String(asset.owner),
      updateAuthority: String((asset.updateAuthority as any)?.address || asset.updateAuthority),
      offchainMetadata,
      explorerUrl: `https://explorer.solana.com/address/${assetAddress}`,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to fetch NFT' });
  }
});

// POST /api/nft/update
// Update name and/or URI of an NFT
router.post('/update', async (req: Request, res: Response) => {
  try {
    const { assetAddress, name, uri, collectionAddress } = req.body;
    if (!assetAddress) return res.status(400).json({ error: 'assetAddress required' });

    const umi = buildUmi();
    const assetPk = umiPublicKey(assetAddress);
    const asset = await fetchAsset(umi, assetPk);

    const updateArgs: any = { asset: { publicKey: assetPk, ...asset } };
    if (name) updateArgs.name = name;
    if (uri) updateArgs.uri = uri;
    if (collectionAddress) updateArgs.collection = { publicKey: umiPublicKey(collectionAddress) };

    const { signature } = await update(umi, updateArgs).sendAndConfirm(umi, {
      confirm: { commitment: 'confirmed' },
    });

    return res.json({
      success: true,
      assetAddress,
      name: name || asset.name,
      signature: Buffer.from(signature).toString('base64'),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to update NFT' });
  }
});

// POST /api/nft/transfer
router.post('/transfer', async (req: Request, res: Response) => {
  try {
    const { assetAddress, newOwnerAddress, collectionAddress } = req.body;
    if (!assetAddress || !newOwnerAddress) {
      return res.status(400).json({ error: 'assetAddress and newOwnerAddress required' });
    }

    const umi = buildUmi();
    const assetPk = umiPublicKey(assetAddress);
    const asset = await fetchAsset(umi, assetPk);

    const transferArgs: any = {
      asset: { publicKey: assetPk, ...asset },
      newOwner: umiPublicKey(newOwnerAddress),
    };
    if (collectionAddress) transferArgs.collection = { publicKey: umiPublicKey(collectionAddress) };

    const { signature } = await transfer(umi, transferArgs).sendAndConfirm(umi, {
      confirm: { commitment: 'confirmed' },
    });

    return res.json({
      success: true,
      assetAddress,
      newOwner: newOwnerAddress,
      signature: Buffer.from(signature).toString('base64'),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to transfer NFT' });
  }
});

// POST /api/nft/burn
router.post('/burn', async (req: Request, res: Response) => {
  try {
    const { assetAddress, collectionAddress } = req.body;
    if (!assetAddress) return res.status(400).json({ error: 'assetAddress required' });

    const umi = buildUmi();
    const assetPk = umiPublicKey(assetAddress);
    const asset = await fetchAsset(umi, assetPk);

    const burnArgs: any = { asset: { publicKey: assetPk, ...asset } };
    if (collectionAddress) burnArgs.collection = { publicKey: umiPublicKey(collectionAddress) };

    const { signature } = await burn(umi, burnArgs).sendAndConfirm(umi, {
      confirm: { commitment: 'confirmed' },
    });

    return res.json({
      success: true,
      assetAddress,
      burned: true,
      signature: Buffer.from(signature).toString('base64'),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to burn NFT' });
  }
});

// POST /api/nft/gacha-mint
// Generate AI art + mint an NFT for a gacha pull result
router.post('/gacha-mint', async (req: Request, res: Response) => {
  try {
    const { cardName, cardRole, cardRarity, abilities, ownerAddress } = req.body;
    if (!cardName || !cardRarity) {
      return res.status(400).json({ error: 'cardName and cardRarity are required' });
    }

    const umi = buildUmi();

    // Generate AI image for the card
    let imageUrl = '';
    let imagePrompt = '';
    try {
      const rarityAdjective: Record<string, string> = {
        legendary: 'golden glowing legendary ultra-rare',
        epic: 'purple glowing epic',
        rare: 'blue shimmering rare',
        common: 'silver common',
      };
      const adj = rarityAdjective[cardRarity] || 'common';
      imagePrompt = `${adj} AI agent character named "${cardName}", role: ${cardRole || 'Agent'}, pixel art NFT card art, solana blockchain, CLAWD lobster claw motif, dark cyberpunk background, holographic card border`;

      const imgResponse = await openai.images.generate({
        model: 'dall-e-3',
        prompt: imagePrompt,
        n: 1,
        size: '1024x1024',
        style: cardRarity === 'legendary' ? 'vivid' : 'natural',
        response_format: 'url',
      });
      imageUrl = imgResponse.data[0]?.url || '';
    } catch (imgErr) {
      console.warn('Image generation failed for gacha mint:', imgErr);
      imageUrl = `https://placehold.co/400x400/1a0a2e/9333ea?text=${encodeURIComponent(cardName)}`;
    }

    if (imageUrl && imagePrompt && !imageUrl.includes('placehold.co')) {
      const item = objectStore.makeItem({
        type: 'image',
        title: `${cardRarity} ${cardName}`.slice(0, 70),
        prompt: imagePrompt,
        sourceUrl: imageUrl,
        model: 'dall-e-3',
        creator: 'site:gacha-mint',
        metadata: {
          source: 'site',
          route: '/api/nft/gacha-mint',
          cardName,
          cardRole,
          cardRarity,
        },
      });
      objectStore.saveGalleryItem(item).catch((err) => {
        console.warn('Could not save gacha mint image to gallery storage:', err);
      });
    }

    // Mint the NFT
    const metadata = {
      name: cardName,
      description: `${cardRarity.toUpperCase()} CLAWD Gacha Agent — ${cardRole}. Abilities: ${(abilities || []).join(', ')}`,
      image: imageUrl,
      attributes: [
        { trait_type: 'Rarity', value: cardRarity },
        { trait_type: 'Role', value: cardRole || 'Agent' },
        { trait_type: 'Platform', value: 'CLAWD Gacha' },
        ...(abilities || []).map((a: string) => ({ trait_type: 'Ability', value: a })),
      ],
    };
    const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;
    const assetSigner = generateSigner(umi);

    const createArgs: any = { asset: assetSigner, name: cardName, uri };
    if (ownerAddress) createArgs.owner = umiPublicKey(ownerAddress);

    const { signature } = await create(umi, createArgs).sendAndConfirm(umi, {
      confirm: { commitment: 'confirmed' },
    });

    return res.json({
      success: true,
      assetAddress: String(assetSigner.publicKey),
      name: cardName,
      imageUrl,
      rarity: cardRarity,
      signature: Buffer.from(signature).toString('base64'),
      owner: ownerAddress || String(umi.identity.publicKey),
      explorerUrl: `https://explorer.solana.com/address/${assetSigner.publicKey}`,
      solscanUrl: `https://solscan.io/token/${assetSigner.publicKey}`,
    });
  } catch (error: any) {
    console.error('Error in gacha mint:', error);
    return res.status(500).json({ error: error?.message || 'Gacha mint failed' });
  }
});

// GET /api/nft/health
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const umi = buildUmi();
    const slot = await umi.rpc.getSlot();
    return res.json({
      success: true,
      rpcConfigured: !!process.env.HELIUS_RPC_URL,
      walletConfigured: !!process.env.WALLET_PRIVATE_KEY,
      openaiConfigured: !!process.env.OPENAI_API_KEY,
      currentSlot: slot,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message });
  }
});

export default router;
