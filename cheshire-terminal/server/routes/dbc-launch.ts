import { Router, Request, Response } from 'express';
import { rateLimit } from '../lib/rate-limit';
import { PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import BN from 'bn.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import {
  buildCreateConfigTransaction,
  buildLaunchTokenTransaction,
  buildBondingCurveSwapTx,
  getBondingCurveQuote,
  buildMigrateToDammV2Tx,
  getVirtualPool,
  getPoolsByConfig,
  getConnection,
  getPayerKeypair,
} from '../lib/dbc/index';
import { trackUsageFromRequest } from '../lib/usage';
import {
  getConfiguredDbcConfigAddress,
  getConfiguredDbcFeeWallet,
  requireDefaultDbcConfigAddress,
  resolveDbcFeeWallet,
} from '../lib/launchpad/fee-wallet';
import { sendOptimizedRawTransaction } from '../lib/helius/transactionOptimization';

const router = Router();

// 30 requests per minute per IP — bonding-curve endpoints do RPC calls so keep this conservative.
router.use(rateLimit({ windowMs: 60_000, max: 30, message: 'Rate limit exceeded on DBC API. Try again shortly.' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchPoolConfigAccount(address: string) {
  const connection = getConnection();
  const payer = getPayerKeypair();
  const candidatePaths = [
    path.resolve(__dirname, '../lib/dbc/release_0.1.6.json'),
    path.resolve(__dirname, '../server/lib/dbc/release_0.1.6.json'),
  ];

  const idlPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (!idlPath) {
    throw new Error('DBC IDL file not found in expected runtime paths');
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(idl as any, provider);
  return (program.account as any).poolConfig.fetch(new PublicKey(address));
}

function adminGuard(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'ADMIN_SECRET is required for DBC admin operations.' });
    return false;
  }
  if (req.headers['x-admin-secret'] !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

router.post('/create-config', async (req: Request, res: Response) => {
  if (!adminGuard(req, res)) return;
  try {
    const { feeClaimer, leftoverReceiver, migrationThresholdSol } = req.body;

    const feeWallet = resolveDbcFeeWallet(feeClaimer);
    const leftoverReceiverPubkey = leftoverReceiver
      ? new PublicKey(leftoverReceiver)
      : feeWallet.publicKey;

    const customParams = migrationThresholdSol != null
      ? { migrationQuoteThreshold: new BN(Math.round(migrationThresholdSol * LAMPORTS_PER_SOL)) }
      : undefined;

    const { transaction, configAddress } = await buildCreateConfigTransaction(
      feeWallet.publicKey,
      leftoverReceiverPubkey,
      customParams
    );

    const connection = getConnection();
    const txBuffer = Buffer.from(transaction, 'base64');
    const tx = Transaction.from(txBuffer);
    const { signature: sig } = await sendOptimizedRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(sig, 'confirmed');

    res.json({
      configAddress,
      signature: sig,
      feeClaimer: feeWallet.publicKey.toBase58(),
      feeWalletSource: feeWallet.source,
      leftoverReceiver: leftoverReceiverPubkey.toBase58(),
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

router.get('/fee-wallet', async (_req: Request, res: Response) => {
  try {
    const feeWallet = getConfiguredDbcFeeWallet();
    const defaultConfig = getConfiguredDbcConfigAddress();

    res.json({
      configured: !!feeWallet,
      feeWallet: feeWallet?.publicKey.toBase58() ?? null,
      feeWalletSource: feeWallet?.source ?? null,
      defaultConfigAddress: defaultConfig?.publicKey.toBase58() ?? null,
      defaultConfigSource: defaultConfig?.source ?? null,
      requiredForPublicLaunch: true,
    });
  } catch (err: any) {
    res.status(503).json({
      configured: false,
      error: err?.message ?? String(err),
      feeWallet: null,
      feeWalletSource: null,
      defaultConfigAddress: null,
      defaultConfigSource: null,
      requiredForPublicLaunch: true,
    });
  }
});

router.get('/config/:address', async (req: Request, res: Response) => {
  try {
    const config = await fetchPoolConfigAccount(req.params.address);
    res.json({ address: req.params.address, ...config });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

router.post('/launch', async (req: Request, res: Response) => {
  try {
    const { name, symbol, uri, configAddress, userWallet, registryEnabled } = req.body;
    if (!name || !symbol || !uri || !userWallet) {
      return res.status(400).json({ error: 'Missing required fields: name, symbol, uri, userWallet' });
    }
    const dbcConfig = requireDefaultDbcConfigAddress(configAddress);

    const result = await buildLaunchTokenTransaction({
      name,
      symbol,
      uri,
      configAddress: dbcConfig.publicKey.toBase58(),
      userWallet,
      launchRegistry: { enabled: registryEnabled !== false },
    });
    trackUsageFromRequest(req, {
      walletAddress: userWallet,
      eventType: "token_deployment",
      productArea: "tokens",
      route: "/api/dbc/launch",
      tokenMint: result.mintAddress,
      units: 1,
      metadata: { name, symbol, configAddress: dbcConfig.publicKey.toBase58(), configSource: dbcConfig.source },
    });
    res.json({
      ...result,
      configAddress: dbcConfig.publicKey.toBase58(),
      configSource: dbcConfig.source,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

router.get('/pool/:address', async (req: Request, res: Response) => {
  try {
    const pool = await getVirtualPool(req.params.address);

    const configState = await fetchPoolConfigAccount(pool.config.toString());

    const migrationThreshold: number = configState.migrationQuoteThreshold?.toNumber() ?? (3 * LAMPORTS_PER_SOL);
    const quoteReserve: number = pool.quoteReserve?.toNumber() ?? 0;
    const graduated: boolean = quoteReserve >= migrationThreshold;
    const migrationProgress = migrationThreshold > 0
      ? Math.min(100, (quoteReserve / migrationThreshold) * 100)
      : 0;

    res.json({
      address: req.params.address,
      ...pool,
      graduated,
      migrationProgress: Number(migrationProgress.toFixed(2)),
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

router.get('/quote', async (req: Request, res: Response) => {
  try {
    const { pool, inputMint, amount } = req.query as Record<string, string>;
    if (!pool || !inputMint || !amount) {
      return res.status(400).json({ error: 'Missing required query params: pool, inputMint, amount' });
    }

    const result = await getBondingCurveQuote({
      poolAddress: pool,
      inputMint,
      amountIn: parseFloat(amount),
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

router.post('/build-swap', async (req: Request, res: Response) => {
  try {
    const { pool, userWallet, inputMint, outputMint, amountIn, slippage } = req.body;
    if (!pool || !userWallet || !inputMint || !outputMint || amountIn == null) {
      return res.status(400).json({ error: 'Missing required fields: pool, userWallet, inputMint, outputMint, amountIn' });
    }

    const quote = await getBondingCurveQuote({ poolAddress: pool, inputMint, amountIn });
    const slippagePct = slippage ?? 1;
    const minAmountOut = quote.amountOut * (1 - slippagePct / 100);

    const transaction = await buildBondingCurveSwapTx({
      poolAddress: pool,
      userWallet,
      inputMint,
      outputMint,
      amountIn,
      minAmountOut,
    });
    trackUsageFromRequest(req, {
      walletAddress: userWallet,
      eventType: "token_trade",
      productArea: "tokens",
      route: "/api/dbc/build-swap",
      tokenMint: outputMint,
      units: 1,
      metadata: { pool, inputMint, outputMint, amountIn, slippagePct },
    });

    res.json({ transaction });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

router.post('/submit', async (req: Request, res: Response) => {
  try {
    const { signedTransaction } = req.body;
    if (!signedTransaction) {
      return res.status(400).json({ error: 'Missing required field: signedTransaction' });
    }

    const connection = getConnection();
    const txBuffer = Buffer.from(signedTransaction, 'base64');
    const { signature } = await sendOptimizedRawTransaction(txBuffer, { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(signature, 'confirmed');

    res.json({ signature });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

router.post('/migrate', async (req: Request, res: Response) => {
  if (!adminGuard(req, res)) return;
  try {
    const { poolAddress, payer, dammConfig } = req.body;
    if (!poolAddress) {
      return res.status(400).json({ error: 'Missing required field: poolAddress' });
    }
    if (!dammConfig) {
      return res.status(400).json({ error: 'Missing required field: dammConfig' });
    }

    const serverPayer = getPayerKeypair();
    const payerAddress = payer ?? serverPayer.publicKey.toBase58();
    if (payerAddress !== serverPayer.publicKey.toBase58()) {
      return res.status(400).json({
        error: 'This server-submit endpoint requires payer to be the configured WALLET_PRIVATE_KEY wallet.',
      });
    }

    const txBase64 = await buildMigrateToDammV2Tx({ poolAddress, payerAddress, dammConfigAddress: dammConfig });
    const connection = getConnection();
    const txBuffer = Buffer.from(txBase64, 'base64');
    const tx = Transaction.from(txBuffer);
    tx.partialSign(serverPayer);

    const { signature } = await sendOptimizedRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(signature, 'confirmed');

    res.json({ signature });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? String(err) });
  }
});

export default router;
