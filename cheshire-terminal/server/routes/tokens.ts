import { Router } from "express";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PumpFunSDK } from "pumpdotfun-sdk";
import bs58 from "bs58";
import multer from "multer";
import { storage } from "../storage";
import express from "express";
import { AMM } from "../lib/AMM";
import { trackUsageFromRequest } from "../lib/usage";
import { sendOptimizedRawTransaction } from "../lib/helius/transactionOptimization";

const router = Router();

// Configure multer for memory storage (only used for file uploads)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Use express.json for JSON routes
router.use(express.json());

// Initialize connection and SDK with mainnet configuration
const RPC_URL =
  process.env.HELIUS_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  process.env.VITE_HELIUS_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

if (!process.env.HELIUS_RPC_URL) {
  console.warn(
    "[tokens] HELIUS_RPC_URL not set — falling back to public Solana RPC (rate-limited)."
  );
}

const connection = new Connection(RPC_URL, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000
});

// Initialize SDK with mainnet program ID
const PUMP_FUN_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

let sdk: PumpFunSDK | null = null;
let signingKeypair: Keypair | null = null;

try {
  if (!process.env.WALLET_PRIVATE_KEY) {
    throw new Error('WALLET_PRIVATE_KEY is required');
  }

  const privateKeyBytes = bs58.decode(process.env.WALLET_PRIVATE_KEY);
  signingKeypair = Keypair.fromSecretKey(privateKeyBytes);
  console.log("Wallet initialized with public key:", signingKeypair.publicKey.toBase58());

  const provider = new AnchorProvider(
    connection,
    {
      publicKey: signingKeypair.publicKey,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        if (tx instanceof Transaction) {
          tx.partialSign(signingKeypair!);
        } else {
          tx.sign([signingKeypair!]);
        }
        return tx;
      },
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
        return txs.map(tx => {
          if (tx instanceof Transaction) {
            tx.partialSign(signingKeypair!);
          } else {
            tx.sign([signingKeypair!]);
          }
          return tx;
        });
      },
    },
    { commitment: "confirmed" }
  );

  sdk = new PumpFunSDK(provider);
  console.log("PumpFun SDK initialized successfully for mainnet");
} catch (error) {
  // Log the error but DO NOT call process.exit — the rest of the server must keep running
  console.error("[tokens] PumpFun SDK failed to initialize (token launch routes will return 503):", error);
}

// Add the launched tokens endpoint before the token launch endpoint
router.get("/launched", async (req, res) => {
  try {
    const tokens = await storage.getTokens();
    console.log("Fetched launched tokens:", tokens);

    // Sort by createdAt descending to show newest first
    const sortedTokens = tokens.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    // Return empty array if no tokens found instead of error
    res.json(sortedTokens || []);
  } catch (error) {
    console.error("Error fetching launched tokens:", error);
    // Return empty array instead of error for better UX
    res.json([]);
  }
});

// Modify the token launch endpoint to ensure proper JSON responses
router.post("/launch", async (req, res) => {
  try {
    console.log("Starting token launch process...");
    const { name, symbol, description, wallet, initialBuyAmount, imageUrl, buyers } = req.body;

    if (!name || !symbol || !description || !wallet || !initialBuyAmount || !imageUrl) {
      return res.status(400).json({ 
        success: false,
        error: "Missing required fields",
        details: "All fields must be provided" 
      });
    }

    // Convert initialBuyAmount to lamports
    const buyAmount = parseFloat(initialBuyAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid initial buy amount",
        details: "Amount must be a positive number"
      });
    }

    // Validate wallet address
    try {
      new PublicKey(wallet);
    } catch (error) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid wallet address",
        details: error instanceof Error ? error.message : "Invalid format"
      });
    }

    // Generate mint keypair
    const mint = Keypair.generate();
    console.log("Created mint keypair:", mint.publicKey.toBase58());

    try {
      console.log("Attempting to create and buy token...");

      // Create token metadata
      const tokenMetadata = {
        name,
        symbol,
        description,
        image: imageUrl,
        file: await imageUrlToBlob(imageUrl),
        twitter: "",
        telegram: "",
        website: ""
      };

      // Configure token launch parameters
      const launchConfig = {
        unitLimit: 500000,
        unitPrice: 100000,
        metadata: tokenMetadata,
        slippageBps: 500,
      };

      // Initialize SDK with proper configuration
      if (!sdk || !signingKeypair) {
        return res.status(500).json({
          success: false,
          error: "SDK not initialized",
          details: "Internal server error"
        });
      }

      // If buyers are provided, validate addresses
      let validBuyers: PublicKey[] = [];
      if (buyers?.length) {
        try {
          validBuyers = buyers.map((b: string) => new PublicKey(b));
        } catch (error) {
          return res.status(400).json({
            success: false,
            error: "Invalid buyer address",
            details: error instanceof Error ? error.message : "Invalid format"
          });
        }
      }

      if (validBuyers.length) {
        return res.status(501).json({
          success: false,
          error: "Bundle buys are not supported by the installed Pump SDK",
          details: "Launch without buyer wallets, or route bundled purchases through a supported executor."
        });
      }

      // Launch token with proper error handling
      const result = await sdk.createAndBuy(
        signingKeypair,
        mint,
        launchConfig.metadata,
        BigInt(Math.floor(buyAmount * LAMPORTS_PER_SOL)),
        BigInt(launchConfig.slippageBps),
        { 
          unitLimit: launchConfig.unitLimit, 
          unitPrice: launchConfig.unitPrice 
        }
      );

      if (!result || !result.success) {
        console.error("Token launch transaction failed:", result?.error);
        return res.status(500).json({
          success: false,
          error: "Transaction failed",
        details: result?.error ? String(result.error) : "Unknown error occurred"
        });
      }

      console.log("Token launch successful!");
      console.log("Mint address:", mint.publicKey.toBase58());
      console.log("Transaction signature:", result.signature);

      // Store token in database
      const token = await storage.createToken({
        name,
        symbol,
        description,
        mintAddress: mint.publicKey.toBase58(),
        imageUrl,
        metadata: {
          twitter: "",
          telegram: "",
          website: ""
        }
      });
      trackUsageFromRequest(req, {
        walletAddress: wallet,
        eventType: "token_deployment",
        productArea: "tokens",
        route: "/api/tokens/launch",
        tokenMint: mint.publicKey.toBase58(),
        units: 1,
        metadata: {
          name,
          symbol,
          initialBuyAmount: buyAmount,
          signature: result.signature,
        },
      });

      return res.status(200).json({
        success: true,
        token,
        signature: result.signature,
        mintAddress: mint.publicKey.toBase58(),
        buyers: validBuyers.map(b => b.toString())
      });

    } catch (txError) {
      console.error("Transaction error:", txError);
      return res.status(500).json({
        success: false,
        error: "Transaction failed",
        details: txError instanceof Error ? txError.message : String(txError)
      });
    }

  } catch (error) {
    console.error("Token launch error:", error);
    return res.status(500).json({ 
      success: false,
      error: "Failed to launch token",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get token price endpoint
router.get("/:mintAddress/price", async (req, res) => {
  try {
    const { mintAddress } = req.params;

    // Validate mint address
    let publicKey: PublicKey;
    try {
      publicKey = new PublicKey(mintAddress);
    } catch (error) {
      return res.status(400).json({ error: "Invalid mint address" });
    }

    if (!sdk) return res.status(503).json({ error: "Token SDK not available" });

    // Get token data from bonding curve
    const bondingCurveAccount = await sdk.getBondingCurveAccount(publicKey);
    if (!bondingCurveAccount) {
      return res.status(404).json({ error: "Token not found" });
    }

    // Initialize AMM with current reserves
    const amm = new AMM(
      BigInt(bondingCurveAccount.virtualSolReserves.toString()),
      BigInt(bondingCurveAccount.virtualTokenReserves.toString()),
      BigInt(bondingCurveAccount.realSolReserves.toString()),
      BigInt(bondingCurveAccount.realTokenReserves.toString()),
      BigInt(bondingCurveAccount.virtualTokenReserves.toString())
    );

    // Calculate price for 1 token
    const price = amm.getBuyPrice(1n);

    res.json({ 
      price: Number(price) / LAMPORTS_PER_SOL,
      virtualSolReserves: bondingCurveAccount.virtualSolReserves.toString(),
      virtualTokenReserves: bondingCurveAccount.virtualTokenReserves.toString(),
      realSolReserves: bondingCurveAccount.realSolReserves.toString(),
      realTokenReserves: bondingCurveAccount.realTokenReserves.toString()
    });

  } catch (error) {
    console.error("Error getting token price:", error);
    res.status(500).json({ error: "Failed to get token price" });
  }
});

// Buy tokens endpoint
router.post("/:mintAddress/buy", async (req, res) => {
  try {
    const { mintAddress } = req.params;
    const { amount, wallet } = req.body;

    if (!amount || !wallet) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    if (!sdk || !signingKeypair) return res.status(503).json({ error: "Token SDK not available" });

    // Validate addresses
    const mintPubkey = new PublicKey(mintAddress);
    new PublicKey(wallet);

    const result = await sdk.buy(
      signingKeypair,
      mintPubkey,
      BigInt(Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL)),
      500n // 5% slippage
    );

    if (!result.success) {
      throw new Error(result.error ? String(result.error) : "Transaction failed");
    }
    trackUsageFromRequest(req, {
      walletAddress: wallet,
      eventType: "token_trade",
      productArea: "tokens",
      route: `/api/tokens/${mintAddress}/buy`,
      tokenMint: mintAddress,
      units: 1,
      metadata: { side: "buy", amount, signature: result.signature },
    });

    res.json({
      success: true,
      signature: result.signature,
      amount
    });

  } catch (error) {
    console.error("Error buying tokens:", error);
    res.status(500).json({ 
      error: "Failed to buy tokens",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Sell tokens endpoint
router.post("/:mintAddress/sell", async (req, res) => {
  try {
    const { mintAddress } = req.params;
    const { amount, wallet } = req.body;

    if (!amount || !wallet) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    if (!sdk || !signingKeypair) return res.status(503).json({ error: "Token SDK not available" });

    // Validate addresses
    const mintPubkey = new PublicKey(mintAddress);
    new PublicKey(wallet);

    const result = await sdk.sell(
      signingKeypair,
      mintPubkey,
      BigInt(Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL)),
      500n // 5% slippage
    );

    if (!result.success) {
      throw new Error(result.error ? String(result.error) : "Transaction failed");
    }
    trackUsageFromRequest(req, {
      walletAddress: wallet,
      eventType: "token_trade",
      productArea: "tokens",
      route: `/api/tokens/${mintAddress}/sell`,
      tokenMint: mintAddress,
      units: 1,
      metadata: { side: "sell", amount, signature: result.signature },
    });

    res.json({
      success: true,
      signature: result.signature,
      amount
    });

  } catch (error) {
    console.error("Error selling tokens:", error);
    res.status(500).json({ 
      error: "Failed to sell tokens",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// File upload endpoint for token images
router.post("/upload", upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Convert file buffer to base64
    const base64Image = req.file.buffer.toString('base64');
    const imageUrl = `data:${req.file.mimetype};base64,${base64Image}`;

    res.json({ url: imageUrl });
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({ 
      error: "Failed to upload file",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});


// Execute transactions endpoint (JSON only)
router.post("/execute", async (req, res) => {
  try {
    console.log("Executing transactions with payload:", JSON.stringify(req.body));
    const { transactions, signers, options } = req.body;

    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: "Invalid transactions array" });
    }

    // Decode transactions
    const decodedTransactions = transactions.map(txBase64 => {
      const txBuffer = Buffer.from(txBase64, 'base64');
      return Transaction.from(txBuffer);
    });

    // Decode signers if provided
    const decodedSigners = signers?.map((signerBase64: string) => {
      const secretKey = Buffer.from(signerBase64, 'base64');
      return Keypair.fromSecretKey(secretKey);
    }) || [];

    // Execute transactions
    const txOptions = {
      skipPreflight: options?.skipPreflight || false,
      maxRetries: options?.maxRetries || 3
    };

    const signatures = await Promise.all(
      decodedTransactions.map(async (tx) => {
        if (decodedSigners.length) {
          tx.partialSign(...decodedSigners);
        }
        const { signature } = await sendOptimizedRawTransaction(tx.serialize(), txOptions);
        return signature;
      })
    );

    res.json({
      success: true,
      signatures
    });

  } catch (error) {
    console.error("Transaction execution error:", error);
    res.status(500).json({ 
      error: "Failed to execute transactions",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Update just the chart endpoint to include virtualization metrics
router.get("/:mintAddress/chart", async (req, res) => {
  try {
    const { mintAddress } = req.params;
    const { timeframe = '24h' } = req.query;

    // Validate mint address
    let publicKey: PublicKey;
    try {
      publicKey = new PublicKey(mintAddress);
    } catch (error) {
      return res.status(400).json({ error: "Invalid mint address" });
    }

    if (!sdk) return res.status(503).json({ error: "Token SDK not available" });

    // Get bonding curve account for price calculations
    const bondingCurveAccount = await sdk.getBondingCurveAccount(
      publicKey
    );

    if (!bondingCurveAccount) {
      return res.status(404).json({ error: "Token not found" });
    }

    // Calculate time range based on timeframe
    const now = Date.now();
    let startTime: number;
    let interval: number;

    switch (timeframe) {
      case '1h':
        startTime = now - 3600000; // 1 hour ago
        interval = 60000; // 1 minute intervals
        break;
      case '7d':
        startTime = now - 604800000; // 7 days ago
        interval = 3600000; // 1 hour intervals
        break;
      case '30d':
        startTime = now - 2592000000; // 30 days ago
        interval = 86400000; // 1 day intervals
        break;
      default: // 24h
        startTime = now - 86400000; // 24 hours ago
        interval = 900000; // 15 minute intervals
    }

    // Generate data points with virtualization metrics
    const dataPoints = [];
    let currentTime = startTime;

    // Calculate base metrics
    const virtualSolReserves = BigInt(bondingCurveAccount.virtualSolReserves.toString());
    const virtualTokenReserves = BigInt(bondingCurveAccount.virtualTokenReserves.toString());
    const realSolReserves = BigInt(bondingCurveAccount.realSolReserves.toString());
    const realTokenReserves = BigInt(bondingCurveAccount.realTokenReserves.toString());

    // Base price from virtual reserves (in SOL)
    const basePrice = Number(virtualSolReserves) / Number(virtualTokenReserves) * LAMPORTS_PER_SOL;
    const baseVolume = Number(realTokenReserves) / LAMPORTS_PER_SOL;

    while (currentTime <= now) {
      const priceVariation = (Math.random() - 0.5) * 0.1; // 10% max variation
      const volumeVariation = (Math.random() - 0.5) * 0.2; // 20% max variation

      // Calculate simulated metrics based on real data with variations
      const price = basePrice * (1 + priceVariation);
      const volume = baseVolume * (1 + volumeVariation);

      const reserves = {
        virtualSolReserves,
        virtualTokenReserves,
        realSolReserves,
        realTokenReserves
      };

      dataPoints.push({
        timestamp: currentTime,
        price: Number(price.toFixed(9)), // 9 decimal places for SOL
        volume: Number(volume.toFixed(2)),
        virtualSolReserves: reserves.virtualSolReserves.toString(),
        virtualTokenReserves: reserves.virtualTokenReserves.toString(),
        realSolReserves: reserves.realSolReserves.toString(),
        realTokenReserves: reserves.realTokenReserves.toString(),
        isComplete: bondingCurveAccount.complete
      });

      currentTime += interval;
    }

    res.json(dataPoints);
  } catch (error) {
    console.error("Error fetching chart data:", error);
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
});

// Token prediction endpoint
router.get("/:mintAddress/prediction", async (req, res) => {
  try {
    const { mintAddress } = req.params;

    // Validate mint address
    let publicKey: PublicKey;
    try {
      publicKey = new PublicKey(mintAddress);
    } catch (error) {
      return res.status(400).json({ error: "Invalid mint address" });
    }

    if (!sdk) return res.status(503).json({ error: "Token SDK not available" });

    // Get bonding curve account for price calculations
    const bondingCurveAccount = await sdk.getBondingCurveAccount(
      publicKey
    );

    if (!bondingCurveAccount) {
      return res.status(404).json({ error: "Token not found" });
    }

    // Get the last 24 hours of data
    const now = Date.now();
    const startTime = now - 86400000; // 24 hours ago
    const interval = 900000; // 15 minute intervals

    // Generate historical data points
    const historicalData = [];
    let currentTime = startTime;
    let basePrice = 0.001; // Starting price in SOL
    let baseVolume = 1000n;

    while (currentTime <= now) {
      const priceVariation = (Math.random() - 0.5) * 0.1;
      const volumeVariation = (Math.random() - 0.5) * 0.2;

      historicalData.push({
        timestamp: currentTime,
        price: Number(basePrice) * (1 + priceVariation),
        volume: Number(baseVolume) * (1 + volumeVariation)
      });

      currentTime += interval;
    }

    // Generate mock prediction data (replace with actual AI prediction later)
    const prediction = {
      nextHourPrediction: Number(basePrice) * (1 + (Math.random() - 0.5) * 0.2),
      confidence: 0.85,
      trend: "upward",
      factors: [
        "Recent volume increase",
        "Strong community engagement",
        "Positive market sentiment"
      ]
    };

    res.json(prediction);
  } catch (error) {
    console.error("Error generating prediction:", error);
    res.status(500).json({ error: "Failed to generate prediction" });
  }
});

// Add bundleBuys endpoint for bulk token purchases
router.post("/bundle-buy", upload.single('file'), async (req, res) => {
  try {
    console.log("Starting bundle buy process...");

    // Validate request body
    const { name, symbol, description, buyerWallets, initialBuyAmount } = req.body;

    if (!name || !symbol || !description || !buyerWallets || !initialBuyAmount) {
      throw new Error("Missing required fields");
    }

    if (!req.file) {
      throw new Error("Token image is required");
    }

    // Convert initialBuyAmount to SOL
    const buyAmount = parseFloat(initialBuyAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      throw new Error("Invalid initial buy amount");
    }

    // Parse buyer wallets
    const buyersWallets = JSON.parse(buyerWallets);
    if (!Array.isArray(buyersWallets) || buyersWallets.length === 0) {
      throw new Error("Invalid buyer wallets array");
    }

    if (!sdk) return res.status(503).json({ error: "Token SDK not available" });

    return res.status(501).json({
      error: "Bundle buys are not supported by the installed Pump SDK",
      details: "Use the regular launch endpoint or a dedicated bundled transaction service."
    });

  } catch (error) {
    console.error("Bulk token purchase error:", error);
    res.status(500).json({ 
      error: "Failed to execute bulk token purchase",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

async function imageUrlToBlob(imageUrl: string): Promise<Blob> {
  if (imageUrl.startsWith("data:")) {
    const [header, data = ""] = imageUrl.split(",", 2);
    const contentType = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
    const buffer = header.includes(";base64")
      ? Buffer.from(data, "base64")
      : Buffer.from(decodeURIComponent(data), "utf8");

    return new Blob([buffer], { type: contentType });
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch token image: ${response.status} ${response.statusText}`);
  }

  return response.blob();
}

export default router;
