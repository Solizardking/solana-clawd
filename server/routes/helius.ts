import express from 'express';
import { z } from 'zod';
import { heliusService } from '../lib/helius/heliusService';
import { ADMIN_CLAWD_BALANCE, isAdminWallet } from '../lib/access-control';
import {
  HELIUS_FALLBACK_RPC_URL,
  HELIUS_PRIORITY_LEVELS,
  getHeliusPriorityFeeEstimate,
  getHeliusTransactionOptimizationConfig,
  getJitoBundleStatusesViaHelius,
  heliusRpc,
  resolveHeliusRpcUrl,
  sendJitoBundleViaHelius,
  sendOptimizedTransaction,
  simulateJitoBundleViaHelius,
} from '../lib/helius/transactionOptimization';

const router = express.Router();
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const publicKeySchema = z.string().regex(SOLANA_ADDRESS_RE, 'Invalid Solana address');
const tokenTypeSchema = z.enum(['fungible', 'nonFungible', 'regularNft', 'compressedNft', 'all']);
const priorityLevelSchema = z.enum(HELIUS_PRIORITY_LEVELS);
const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

function shouldFallbackFromHelius(message: string, rpcUrl: string) {
  return (
    rpcUrl.includes('helius') &&
    /(max usage reached|429|rate limit)/i.test(message)
  );
}

async function fetchClawdVerification(wallet: string, rpcUrl: string) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'clawd-verify',
      method: 'getTokenAccountsByOwner',
      params: [
        wallet,
        { mint: CLAWD_TOKEN_ADDRESS },
        { encoding: 'jsonParsed' },
      ],
    }),
  });

  return await response.json() as {
    error?: { message: string };
    result?: {
      value?: {
        account?: {
          data?: {
            parsed?: {
              info?: {
                tokenAmount?: { amount?: string; decimals?: number };
              };
            };
          };
        };
      }[];
    };
  };
}

// ─── RPC Proxy ────────────────────────────────────────────────────────────────
// POST /api/helius/rpc — transparent proxy for Helius DAS / enhanced RPC methods
// Used by client HeliusService for getAssetsByOwner, getTokenAccounts, etc.
router.post('/rpc', async (req, res) => {
  try {
    const rpcUrl = resolveHeliusRpcUrl();
    const r = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    return res.status(r.ok ? 200 : r.status).json(data);
  } catch (error) {
    console.error('Helius RPC proxy error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'RPC proxy error' });
  }
});

// GET /api/helius/token/:mint — combined DAS token metadata + largest token accounts
router.get('/token/:mint', async (req, res) => {
  try {
    const schema = z.object({
      mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana mint address'),
    });
    const parsed = schema.safeParse({ mint: req.params.mint });
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid mint address',
        details: parsed.error.format(),
      });
    }

    const mint = parsed.data.mint;
    const [asset, largestAccounts, supply] = await Promise.all([
      heliusRpc('getAsset', {
        id: mint,
        options: {
          showFungible: true,
        },
      }, { requestId: 'helius-token-asset' }),
      heliusRpc('getTokenLargestAccounts', [
        mint,
        { commitment: 'finalized' },
      ], { requestId: 'helius-token-largest' }).catch((error) => ({
        error: error instanceof Error ? error.message : 'Largest accounts unavailable',
      })),
      heliusRpc('getTokenSupply', [
        mint,
        { commitment: 'finalized' },
      ], { requestId: 'helius-token-supply' }).catch((error) => ({
        error: error instanceof Error ? error.message : 'Supply unavailable',
      })),
    ]);

    return res.json({
      success: true,
      data: {
        mint,
        asset,
        largestAccounts,
        supply,
      },
    });
  } catch (error) {
    console.error('Error fetching Helius token data:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Token lookup failed',
    });
  }
});

router.get('/transaction-optimization', (_req, res) => {
  res.json({
    success: true,
    data: getHeliusTransactionOptimizationConfig(),
  });
});

router.post('/priority-fee', async (req, res) => {
  try {
    const schema = z.object({
      transaction: z.string().min(1).optional(),
      accountKeys: z.array(publicKeySchema).max(64).optional(),
      priorityLevel: priorityLevelSchema.default('Medium'),
      includeAllPriorityFeeLevels: z.boolean().optional(),
      transactionEncoding: z.enum(['Base64', 'Base58']).optional(),
      lookbackSlots: z.number().int().min(1).max(150).optional(),
      includeVote: z.boolean().optional(),
      recommended: z.boolean().optional(),
      evaluateEmptySlotAsZero: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid priority fee request', details: parsed.error.format() });
    }
    if (!parsed.data.transaction && (!parsed.data.accountKeys || parsed.data.accountKeys.length === 0)) {
      return res.status(400).json({ success: false, error: 'transaction or accountKeys is required' });
    }

    const result = await getHeliusPriorityFeeEstimate({
      transaction: parsed.data.transaction,
      accountKeys: parsed.data.accountKeys,
      options: {
        priorityLevel: parsed.data.priorityLevel,
        includeAllPriorityFeeLevels: parsed.data.includeAllPriorityFeeLevels,
        transactionEncoding: parsed.data.transactionEncoding,
        lookbackSlots: parsed.data.lookbackSlots,
        includeVote: parsed.data.includeVote,
        recommended: parsed.data.recommended,
        evaluateEmptySlotAsZero: parsed.data.evaluateEmptySlotAsZero,
      },
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error estimating Helius priority fee:', error);
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Priority fee estimate failed' });
  }
});

router.post('/send-transaction', async (req, res) => {
  try {
    const schema = z.object({
      signedTransaction: z.string().min(32),
      mode: z.enum(['rpc', 'sender']).optional(),
      encoding: z.enum(['base64', 'base58']).default('base64'),
      skipPreflight: z.boolean().optional(),
      maxRetries: z.number().int().min(0).max(10).optional(),
      rebateAddress: publicKeySchema.optional(),
      swqosOnly: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid send transaction request', details: parsed.error.format() });
    }

    const result = await sendOptimizedTransaction(parsed.data.signedTransaction, {
      mode: parsed.data.mode,
      encoding: parsed.data.encoding,
      skipPreflight: parsed.data.skipPreflight,
      maxRetries: parsed.data.maxRetries,
      rebateAddress: parsed.data.rebateAddress,
      swqosOnly: parsed.data.swqosOnly,
    });

    return res.json({
      success: true,
      data: {
        ...result,
        explorerUrl: `https://solscan.io/tx/${result.signature}`,
      },
    });
  } catch (error) {
    console.error('Error sending Helius transaction:', error);
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Transaction send failed' });
  }
});

router.post('/bundle', async (req, res) => {
  try {
    const schema = z.object({
      signedTransactions: z.array(z.string().min(32)).min(1).max(5),
      region: z.string().min(2).max(32).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid bundle request', details: parsed.error.format() });
    }
    const result = await sendJitoBundleViaHelius(parsed.data.signedTransactions, parsed.data.region);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error sending Helius bundle:', error);
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Bundle send failed' });
  }
});

router.post('/bundle/statuses', async (req, res) => {
  try {
    const schema = z.object({ bundleIds: z.array(z.string().min(1)).min(1).max(20) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid bundle status request', details: parsed.error.format() });
    }
    const result = await getJitoBundleStatusesViaHelius(parsed.data.bundleIds);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching Helius bundle statuses:', error);
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Bundle status failed' });
  }
});

router.post('/bundle/simulate', async (req, res) => {
  try {
    const schema = z.object({ signedTransactions: z.array(z.string().min(32)).min(1).max(5) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid bundle simulation request', details: parsed.error.format() });
    }
    const result = await simulateJitoBundleViaHelius(parsed.data.signedTransactions);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error simulating Helius bundle:', error);
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Bundle simulation failed' });
  }
});

router.get('/token/:mint/supply', async (req, res) => {
  try {
    const parsed = publicKeySchema.safeParse(req.params.mint);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid mint address' });
    const supply = await heliusRpc('getTokenSupply', [parsed.data, { commitment: 'finalized' }], { requestId: 'helius-token-supply' });
    return res.json({ success: true, data: { mint: parsed.data, supply } });
  } catch (error) {
    console.error('Error fetching token supply:', error);
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Token supply lookup failed' });
  }
});

router.get('/token/:mint/largest-accounts', async (req, res) => {
  try {
    const parsed = publicKeySchema.safeParse(req.params.mint);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid mint address' });
    const largestAccounts = await heliusRpc('getTokenLargestAccounts', [parsed.data, { commitment: 'finalized' }], { requestId: 'helius-token-largest' });
    return res.json({ success: true, data: { mint: parsed.data, largestAccounts } });
  } catch (error) {
    console.error('Error fetching largest token accounts:', error);
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Largest accounts lookup failed' });
  }
});

router.get('/token-account/:account/balance', async (req, res) => {
  try {
    const parsed = publicKeySchema.safeParse(req.params.account);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid token account address' });
    const balance = await heliusRpc('getTokenAccountBalance', [parsed.data], { requestId: 'helius-token-account-balance' });
    return res.json({ success: true, data: { tokenAccount: parsed.data, balance } });
  } catch (error) {
    console.error('Error fetching token account balance:', error);
    return res.status(502).json({ success: false, error: error instanceof Error ? error.message : 'Token account balance lookup failed' });
  }
});

router.get('/wallet/:owner/token-accounts', async (req, res) => {
  try {
    const owner = publicKeySchema.parse(req.params.owner);
    const querySchema = z.object({
      mint: publicKeySchema.optional(),
      programId: z.union([
        z.literal('spl-token'),
        z.literal('token-2022'),
        publicKeySchema,
      ]).optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(200),
    });
    const query = querySchema.parse(req.query);
    const programId = query.programId === 'token-2022'
      ? TOKEN_2022_PROGRAM_ID
      : query.programId === 'spl-token' || !query.programId
        ? SPL_TOKEN_PROGRAM_ID
        : query.programId;
    const filter = query.mint ? { mint: query.mint } : { programId };
    const result = await heliusRpc<any>('getTokenAccountsByOwner', [
      owner,
      filter,
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ], { requestId: 'helius-token-accounts-by-owner' });

    const value = Array.isArray(result?.value) ? result.value.slice(0, query.limit) : [];
    return res.json({
      success: true,
      data: {
        owner,
        filter,
        count: value.length,
        value,
      },
    });
  } catch (error) {
    console.error('Error fetching wallet token accounts:', error);
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Wallet token account lookup failed' });
  }
});

router.get('/wallet/:owner/assets', async (req, res) => {
  try {
    const ownerAddress = publicKeySchema.parse(req.params.owner);
    const querySchema = z.object({
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      showFungible: z.coerce.boolean().default(true),
      showNativeBalance: z.coerce.boolean().default(true),
      showGrandTotal: z.coerce.boolean().default(true),
      showZeroBalance: z.coerce.boolean().default(false),
    });
    const query = querySchema.parse(req.query);
    const assets = await heliusRpc('getAssetsByOwner', {
      ownerAddress,
      page: query.page,
      limit: query.limit,
      displayOptions: {
        showFungible: query.showFungible,
        showNativeBalance: query.showNativeBalance,
        showGrandTotal: query.showGrandTotal,
        showZeroBalance: query.showZeroBalance,
      },
    }, { requestId: 'helius-assets-by-owner' });
    return res.json({ success: true, data: assets });
  } catch (error) {
    console.error('Error fetching wallet assets:', error);
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Wallet asset lookup failed' });
  }
});

router.get('/wallet/:owner/fungibles', async (req, res) => {
  try {
    const ownerAddress = publicKeySchema.parse(req.params.owner);
    const querySchema = z.object({
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      tokenType: tokenTypeSchema.default('fungible'),
    });
    const query = querySchema.parse(req.query);
    const assets = await heliusRpc('searchAssets', {
      ownerAddress,
      tokenType: query.tokenType,
      page: query.page,
      limit: query.limit,
      sortBy: { sortBy: 'id', sortDirection: 'asc' },
    }, { requestId: 'helius-search-fungibles' });
    return res.json({ success: true, data: assets });
  } catch (error) {
    console.error('Error fetching wallet fungibles:', error);
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Wallet fungibles lookup failed' });
  }
});

router.get('/wallet/:address/transfer-history', async (req, res) => {
  try {
    const address = publicKeySchema.parse(req.params.address);
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      paginationToken: z.string().optional(),
      commitment: z.enum(['confirmed', 'finalized']).default('finalized'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
      direction: z.enum(['in', 'out', 'any']).optional(),
      mint: publicKeySchema.optional(),
      with: publicKeySchema.optional(),
      solMode: z.enum(['merged', 'separate']).optional(),
    });
    const query = querySchema.parse(req.query);
    const config = {
      limit: query.limit,
      paginationToken: query.paginationToken,
      commitment: query.commitment,
      sortOrder: query.sortOrder,
      direction: query.direction,
      mint: query.mint,
      with: query.with,
      solMode: query.solMode,
    };
    const transfers = await heliusRpc('getTransfersByAddress', [address, config], { requestId: 'helius-transfers-by-address' });
    return res.json({ success: true, data: transfers });
  } catch (error) {
    console.error('Error fetching Helius transfer history:', error);
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Transfer history lookup failed' });
  }
});

router.get('/wallet/:address/transactions-v2', async (req, res) => {
  try {
    const address = publicKeySchema.parse(req.params.address);
    const querySchema = z.object({
      transactionDetails: z.enum(['signatures', 'full']).default('signatures'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
      limit: z.coerce.number().int().min(1).max(1000).default(100),
      paginationToken: z.string().optional(),
      commitment: z.enum(['confirmed', 'finalized']).default('finalized'),
      status: z.enum(['succeeded', 'failed', 'any']).optional(),
      tokenAccounts: z.enum(['none', 'balanceChanged', 'all']).default('balanceChanged'),
      mint: publicKeySchema.optional(),
      direction: z.enum(['in', 'out', 'any']).optional(),
    });
    const query = querySchema.parse(req.query);
    const filters: Record<string, unknown> = {
      tokenAccounts: query.tokenAccounts,
    };
    if (query.status) filters.status = query.status;
    if (query.mint || query.direction) {
      filters.tokenTransfer = {
        ...(query.mint ? { mint: query.mint } : {}),
        ...(query.direction ? { direction: query.direction } : {}),
      };
    }
    const history = await heliusRpc('getTransactionsForAddress', [
      address,
      {
        transactionDetails: query.transactionDetails,
        sortOrder: query.sortOrder,
        limit: query.transactionDetails === 'full' ? Math.min(query.limit, 100) : query.limit,
        paginationToken: query.paginationToken,
        commitment: query.commitment,
        maxSupportedTransactionVersion: 0,
        filters,
      },
    ], { requestId: 'helius-transactions-for-address' });
    return res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching Helius transaction history:', error);
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Transaction history lookup failed' });
  }
});

// Get wallet assets (tokens and NFTs)
router.get('/wallet-assets/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }
    
    // Get assets using Helius DAS API
    const assets = await heliusService.getAssetsByOwner(walletAddress);
    
    // Get token balances
    const balances = await heliusService.getWalletBalances(walletAddress);
    
    return res.status(200).json({
      success: true,
      data: {
        assets,
        balances
      }
    });
  } catch (error) {
    console.error('Error fetching wallet assets:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Burn token endpoint
router.post('/burn-token', async (req, res) => {
  try {
    const schema = z.object({
      mintAddress: z.string().min(1),
      walletAddress: z.string().min(1),
      closeAccount: z.boolean().default(true)
    });
    
    const validationResult = schema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validationResult.error.format()
      });
    }
    
    const { mintAddress, walletAddress, closeAccount } = validationResult.data;
    
    // Burn the token
    const result = await heliusService.burnToken(
      mintAddress,
      walletAddress,
      closeAccount
    );
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error burning token:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Burn NFT endpoint
router.post('/burn-nft', async (req, res) => {
  try {
    const schema = z.object({
      mintAddress: z.string().min(1),
      walletAddress: z.string().min(1)
    });
    
    const validationResult = schema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validationResult.error.format()
      });
    }
    
    const { mintAddress, walletAddress } = validationResult.data;
    
    // Burn the NFT
    const result = await heliusService.burnNft(walletAddress, mintAddress);
    
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error burning NFT:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Close empty token accounts
router.post('/close-accounts', async (req, res) => {
  try {
    const schema = z.object({
      walletAddress: z.string().min(1)
    });
    
    const validationResult = schema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validationResult.error.format()
      });
    }
    
    const { walletAddress: _walletAddress } = validationResult.data;
    
    // This would need to be implemented in the heliusService
    // The implementation would find empty token accounts and close them
    return res.status(200).json({
      success: true,
      data: {
        accountsClosed: 0,
        signature: 'simulation-only'
      }
    });
  } catch (error) {
    console.error('Error closing empty accounts:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// ─── Wallet Transfers (Helius Wallet API v1) ──────────────────────────────

// GET /api/helius/wallet/:address/transfers?limit=50&cursor=...
router.get('/wallet/:address/transfers', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit, cursor } = req.query as Record<string, string>;
    const data = await heliusService.getWalletTransfers(address, {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    console.error('Error fetching wallet transfers:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ─── Parsed Transaction History ───────────────────────────────────────────

// GET /api/helius/wallet/:address/transactions?limit=50&before=<sig>&type=SWAP
router.get('/wallet/:address/transactions', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit, before, commitment, type } = req.query as Record<string, string>;
    const data = await heliusService.getParsedTransactions(address, {
      limit: limit ? Number(limit) : undefined,
      before,
      commitment,
      type,
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching parsed transactions:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/helius/transaction/:signature
router.get('/transaction/:signature', async (req, res) => {
  try {
    const data = await heliusService.parseTransaction(req.params.signature);
    if (!data) return res.status(404).json({ success: false, error: 'Transaction not found' });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error parsing transaction:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ─── CLAWD Token Gate Verification ───────────────────────────────────────
// Uses getTokenAccountsByOwner RPC to check if wallet holds CLAWD token
const CLAWD_TOKEN_ADDRESS = '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';

router.get('/verify-clawd', async (req, res) => {
  try {
    const wallet = req.query.wallet as string;
    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet address required' });
    }

    if (isAdminWallet(wallet)) {
      return res.json({
        success: true,
        wallet,
        token: CLAWD_TOKEN_ADDRESS,
        balance: ADMIN_CLAWD_BALANCE,
        decimals: 6,
        rawBalance: ADMIN_CLAWD_BALANCE * 10 ** 6,
        isHolder: true,
        isAdmin: true,
      });
    }

    const rpcUrl = resolveHeliusRpcUrl();
    let data = await fetchClawdVerification(wallet, rpcUrl);
    if (data.error && shouldFallbackFromHelius(data.error.message, rpcUrl)) {
      data = await fetchClawdVerification(wallet, HELIUS_FALLBACK_RPC_URL);
    }

    if (data.error) {
      return res.status(500).json({ success: false, error: data.error.message });
    }

    const accounts = data.result?.value || [];
    let totalRawBalance = 0;
    let decimals = 6;

    for (const acc of accounts) {
      const info = acc.account?.data?.parsed?.info;
      if (info) {
        totalRawBalance += Number(info.tokenAmount?.amount || 0);
        decimals = info.tokenAmount?.decimals ?? decimals;
      }
    }

    const balance = totalRawBalance / (10 ** decimals);
    const isHolder = balance >= 1;

    return res.json({
      success: true,
      wallet,
      token: CLAWD_TOKEN_ADDRESS,
      balance,
      decimals,
      rawBalance: totalRawBalance,
      isHolder,
      isAdmin: false,
    });
  } catch (error) {
    console.error('Error verifying CLAWD token:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    });
  }
});

export default router;
