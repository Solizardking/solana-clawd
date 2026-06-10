# 📡 Dark Helius — Helius Smart Infrastructure Module

**Enterprise-grade Solana infrastructure with smart RPC, webhooks, DAS API, and priority fee optimization.**

> 🚀 Ultra-low latency RPC | 🔔 Webhook management | 🎨 DAS NFT API | ⚡ Priority fee estimation

## Features

| Feature | Description |
|---------|-------------|
| 📡 **Smart RPC** | Optimized compute units, priority fee estimation, multi-region redundancy |
| 🔔 **Webhooks** | Real-time transaction monitoring, account updates, event streaming |
| 🎨 **DAS API** | Digital Asset Standard — NFT metadata, ownership, compressed NFTs |
| ⚡ **Priority Fees** | Dynamic fee calculation based on network congestion |
| 🔄 **Transaction Broadcasting** | Reliable submission with retry logic |
| 📊 **Enhanced APIs** | Rich transaction data with parsed instructions |

## Usage

```typescript
import {
  HeliusClient,
  SmartTransaction,
  estimatePriorityFee,
  createWebhook,
  dasGetAsset,
  SmartTransactionOptions,
} from "@dark-helius/index";

const client = new HeliusClient("your-helius-api-key");

// Smart transaction with auto-optimized compute units
const tx = await client.createSmartTx({
  instructions: [instruction1, instruction2],
  signers: [wallet],
  feePayer: wallet.publicKey,
  priorityFee: await estimatePriorityFee(client.connection),
});

// Get DAS asset metadata
const asset = await client.dasGetAsset("NFT_MINT_ADDRESS");

// Create webhook for transaction monitoring
const webhook = await client.createWebhook({
  webhookUrl: "https://myapp.com/webhook",
  transactionTypes: ["ANY"],
  accountAddresses: ["MONITORED_ADDRESS"],
});