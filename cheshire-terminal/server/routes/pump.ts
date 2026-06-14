import { Router, type Request, type Response } from "express";
import multer from "multer";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { rateLimit } from "../lib/rate-limit";
import { trackUsageFromRequest } from "../lib/usage";
import {
  PUMP_BUYBACK_FEE_RECIPIENTS,
  PUMP_NORMAL_FEE_RECIPIENTS,
  PUMP_RESERVED_FEE_RECIPIENTS,
} from "../lib/pump/constants";

const router = Router();
const pumpSdkModulePath = "./pump/index.js";
type PumpSdkModule = typeof import("../lib/pump/index");
const PUMP_METADATA_UPLOAD_URL = "https://pump.fun/api/ipfs";

const metadataUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype)) {
      cb(new Error("Token image must be a PNG, JPG, GIF, or WEBP file."));
      return;
    }
    cb(null, true);
  },
});

router.use(rateLimit({
  namespace: "pump:public",
  windowMs: 60_000,
  max: 40,
  message: "Rate limit exceeded on Pump API. Try again shortly.",
}));

async function loadPumpSdk(): Promise<PumpSdkModule> {
  try {
    return await import(pumpSdkModulePath) as PumpSdkModule;
  } catch (error) {
    console.error("[pump] failed to load Pump transaction SDK:", error);
    const unavailable = new Error("Pump transaction builder is temporarily unavailable.");
    (unavailable as Error & { statusCode?: number }).statusCode = 503;
    throw unavailable;
  }
}

function sendPumpError(res: Response, error: unknown) {
  const statusCode = (error as { statusCode?: number })?.statusCode ?? 400;
  const message = (error as { message?: string })?.message ?? String(error);
  res.status(statusCode).json({ error: message });
}

function isValidPubkey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function solToLamportsString(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("SOL amount must be a non-negative number");
  }
  return String(Math.round(numeric * LAMPORTS_PER_SOL));
}

function tokenAmountToBaseUnits(value: unknown, decimals = 6): string | undefined {
  if (value == null || value === "") return undefined;
  const raw = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error("Token amount must be a non-negative decimal number");
  }
  const [whole, fraction = ""] = raw.split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return `${whole}${padded}`.replace(/^0+(?=\d)/, "") || "0";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function extractPumpMetadataUri(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  return firstString(
    record.metadataUri,
    record.metadata_uri,
    record.uri,
    record.metadata,
    (record.metadata as Record<string, unknown> | undefined)?.uri,
  );
}

function resolveAmountFields(body: Record<string, unknown>, side: "buy" | "sell") {
  const amount =
    body.amount ??
    body.baseAmount ??
    tokenAmountToBaseUnits(body.tokenAmount, Number(body.decimals ?? 6));
  const quoteAmount =
    body.quoteAmount ??
    body.maxQuoteAmount ??
    body.minQuoteAmount ??
    solToLamportsString(body.quoteAmountSol ?? body.maxSolCost ?? body.minSolOutput);

  if (amount == null || amount === "") {
    throw new Error("amount is required in base token units, or provide tokenAmount");
  }
  if (quoteAmount == null || quoteAmount === "") {
    throw new Error(side === "buy"
      ? "quoteAmount is required as max quote units, or provide maxSolCost"
      : "quoteAmount is required as min quote units, or provide minSolOutput");
  }

  return { amount, quoteAmount };
}

router.get("/status", (_req: Request, res: Response) => {
  res.json({
    success: true,
    publicLaunchEnabled: true,
    metadataUploadEnabled: true,
    requiresWalletSignature: true,
    custodySigning: false,
    programIds: {
      pump: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      pumpSwap: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
      mayhem: "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e",
    },
    defaults: {
      tokenProgram: "token-2022",
      quoteMint: "So11111111111111111111111111111111111111112",
      quoteTokenProgram: "spl-token",
    },
  });
});

router.get("/fee-recipients", (_req: Request, res: Response) => {
  res.json({
    normal: PUMP_NORMAL_FEE_RECIPIENTS,
    reserved: PUMP_RESERVED_FEE_RECIPIENTS,
    buyback: PUMP_BUYBACK_FEE_RECIPIENTS,
  });
});

router.post("/metadata", metadataUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const { name, symbol, description, twitter, telegram, website } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: "Token image file is required." });
    }
    if (!name || !symbol || !description) {
      return res.status(400).json({ error: "Missing required fields: name, symbol, description" });
    }

    const form = new FormData();
    form.append("file", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    form.append("name", String(name));
    form.append("symbol", String(symbol).toUpperCase());
    form.append("description", String(description));
    form.append("twitter", String(twitter || ""));
    form.append("telegram", String(telegram || ""));
    form.append("website", String(website || ""));
    form.append("showName", "true");

    const upstream = await fetch(PUMP_METADATA_UPLOAD_URL, {
      method: "POST",
      body: form,
    });
    const text = await upstream.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      return res.status(502).json({
        error: "Pump metadata upload failed.",
        details: typeof text === "string" ? text.slice(0, 300) : upstream.statusText,
      });
    }

    const uri = extractPumpMetadataUri(data);
    if (!uri) {
      return res.status(502).json({
        error: "Pump metadata upload response did not include a metadata URI.",
      });
    }

    res.json({
      success: true,
      uri,
      metadataUri: uri,
      imageUri: firstString((data as Record<string, unknown> | null)?.imageUri, (data as Record<string, unknown> | null)?.image),
      name: String(name),
      symbol: String(symbol).toUpperCase(),
      description: String(description),
    });
  } catch (error: any) {
    sendPumpError(res, error);
  }
});

router.post("/launch", async (req: Request, res: Response) => {
  try {
    const {
      name,
      symbol,
      uri,
      metadataUri,
      userWallet,
      creator,
      mayhemMode,
      cashback,
      quoteMint,
      registryEnabled,
      agentWallet,
      agentAuthority,
      agentAssetAddress,
    } = req.body;

    if (!name || !symbol || !(uri || metadataUri) || !userWallet) {
      return res.status(400).json({ error: "Missing required fields: name, symbol, uri, userWallet" });
    }
    if (!isValidPubkey(userWallet)) {
      return res.status(400).json({ error: "userWallet must be a valid Solana public key" });
    }
    if (creator && !isValidPubkey(creator)) {
      return res.status(400).json({ error: "creator must be a valid Solana public key" });
    }
    if (agentWallet && !isValidPubkey(agentWallet)) {
      return res.status(400).json({ error: "agentWallet must be a valid Solana public key" });
    }
    if (agentAuthority && !isValidPubkey(agentAuthority)) {
      return res.status(400).json({ error: "agentAuthority must be a valid Solana public key" });
    }

    const shouldBindAgent = !!agentWallet || !!agentAssetAddress;
    const { buildPumpLaunchTransaction } = await loadPumpSdk();
    const launch = await buildPumpLaunchTransaction({
      name: String(name),
      symbol: String(symbol),
      uri: String(uri || metadataUri),
      userWallet,
      creator,
      mayhemMode: !!mayhemMode,
      cashback: !!cashback,
      quoteMint,
      launchRegistry: {
        enabled: registryEnabled !== false,
      },
      clawdAgentBinding: shouldBindAgent
        ? {
          enabled: true,
          agentWallet: agentWallet || userWallet,
          authority: agentAuthority || userWallet,
          character: {
            name: String(name),
            symbol: String(symbol).toUpperCase(),
            uri: String(uri || metadataUri),
            assetAddress: agentAssetAddress,
          },
        }
        : undefined,
    });

    trackUsageFromRequest(req, {
      walletAddress: userWallet,
      eventType: "token_deployment",
      productArea: "tokens",
      route: "/api/pump/launch",
      tokenMint: launch.mintAddress,
      units: 1,
      metadata: {
        name,
        symbol,
        creator: launch.creator,
        bondingCurve: launch.bondingCurveAddress,
        agentBound: !!launch.clawdAgentBinding,
      },
    });

    res.json({
      success: true,
      requiresSignature: true,
      ...launch,
      pumpUrl: `https://pump.fun/coin/${launch.mintAddress}`,
      solscanUrl: `https://solscan.io/token/${launch.mintAddress}`,
    });
  } catch (error: any) {
    sendPumpError(res, error);
  }
});

async function buildTradeHandler(req: Request, res: Response, side: "buy" | "sell") {
  try {
    const {
      mint,
      userWallet,
      creator,
      tokenProgram,
      quoteMint,
      quoteTokenProgram,
      feeRecipient,
      buybackFeeRecipient,
      mayhemMode,
    } = req.body;

    if (!mint || !userWallet) {
      return res.status(400).json({ error: "Missing required fields: mint, userWallet" });
    }
    if (!isValidPubkey(mint)) {
      return res.status(400).json({ error: "mint must be a valid Solana public key" });
    }
    if (!isValidPubkey(userWallet)) {
      return res.status(400).json({ error: "userWallet must be a valid Solana public key" });
    }
    if (creator && !isValidPubkey(creator)) {
      return res.status(400).json({ error: "creator must be a valid Solana public key" });
    }

    const { amount, quoteAmount } = resolveAmountFields(req.body, side);
    const { buildPumpTradeTransaction } = await loadPumpSdk();
    const trade = await buildPumpTradeTransaction({
      side,
      mint,
      userWallet,
      amount: amount as string | number,
      quoteAmount: quoteAmount as string | number,
      creator,
      tokenProgram,
      quoteMint,
      quoteTokenProgram,
      feeRecipient,
      buybackFeeRecipient,
      mayhemMode,
    });

    trackUsageFromRequest(req, {
      walletAddress: userWallet,
      eventType: "token_trade",
      productArea: "tokens",
      route: side === "buy" ? "/api/pump/build-buy" : "/api/pump/build-sell",
      tokenMint: mint,
      units: 1,
      metadata: {
        side,
        amount: trade.amount,
        quoteAmount: trade.quoteAmount,
        creator: trade.creator,
      },
    });

    res.json({
      success: true,
      requiresSignature: true,
      ...trade,
      pumpUrl: `https://pump.fun/coin/${trade.mintAddress}`,
    });
  } catch (error: any) {
    sendPumpError(res, error);
  }
}

router.post("/build-buy", (req: Request, res: Response) => buildTradeHandler(req, res, "buy"));
router.post("/build-sell", (req: Request, res: Response) => buildTradeHandler(req, res, "sell"));

router.post("/submit", async (req: Request, res: Response) => {
  try {
    const { signedTransaction } = req.body;
    if (!signedTransaction) {
      return res.status(400).json({ error: "Missing required field: signedTransaction" });
    }
    const { submitPumpTransaction } = await loadPumpSdk();
    const signature = await submitPumpTransaction(String(signedTransaction));
    res.json({
      success: true,
      signature,
      solscanUrl: `https://solscan.io/tx/${signature}`,
    });
  } catch (error: any) {
    sendPumpError(res, error);
  }
});

export default router;
