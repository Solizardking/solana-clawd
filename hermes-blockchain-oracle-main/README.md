
```
    ╦ ╦╔═╗╦═╗╔╦╗╔═╗╔═╗
    ╠═╣║╣ ╠╦╝║║║║╣ ╚═╗
    ╩ ╩╚═╝╩╚═╩ ╩╚═╝╚═╝
    ╔╗ ╦  ╔═╗╔═╗╦╔═╔═╗╦ ╦╔═╗╦╔╗╔
    ╠╩╗║  ║ ║║  ╠╩╗║  ╠═╣╠═╣║║║║
    ╚═╝╩═╝╚═╝╚═╝╩ ╩╚═╝╩ ╩╩ ╩╩╝╚╝
    ╔═╗╦═╗╔═╗╔═╗╦  ╔═╗
    ║ ║╠╦╝╠═╣║  ║  ║╣
    ╚═╝╩╚═╩ ╩╚═╝╩═╝╚═╝
```

<div align="center">

# 🔮 Hermes Blockchain Oracle

### *Giving Hermes Agent superpowers on the Solana blockchain*

[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blueviolet?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDJMMiA3bDEwIDUgMTAtNS0xMC01ek0yIDE3bDEwIDUgMTAtNS0xMC01LTEwIDV6TTIgMTJsMTAgNSAxMC01LTEwLTUtMTAgNXoiIGZpbGw9IndoaXRlIi8+PC9zdmc+)](https://github.com/NousResearch)
[![Solana](https://img.shields.io/badge/Solana-Mainnet-00FFA3?style=for-the-badge&logo=solana)](https://solana.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
[![Nous Research](https://img.shields.io/badge/Nous-Research-ff6b35?style=for-the-badge)](https://nousresearch.com)

---

*A Model Context Protocol (MCP) server that connects [Hermes Agent](https://github.com/NousResearch) to the Solana blockchain — enabling natural language queries for wallets, tokens, NFTs, transactions, whale movements, and network health.*

</div>

---

## 🌟 What Is This?

**Hermes Blockchain Oracle** is an MCP server plugin for **Hermes Agent** by [Nous Research](https://nousresearch.com). It acts as a bridge between conversational AI and the Solana blockchain, letting you ask questions in plain English and get rich, real-time on-chain data back.

No more copy-pasting wallet addresses into block explorers. No more decoding raw transaction logs. Just *ask Hermes*.

> **"What's the SOL balance of `7xKXtg...`?"** → Hermes knows.
>
> **"Are there any whale movements right now?"** → Hermes is watching.
>
> **"Show me the NFTs in this wallet."** → Hermes delivers.

---

## ⚡ Features

| Tool | Description |
|------|-------------|
| 🏦 **`solana_wallet_info`** | Query any wallet's SOL balance, token holdings, and portfolio value |
| 🔍 **`solana_transaction`** | Look up full transaction details by signature — instructions, fees, status |
| 🪙 **`solana_token_info`** | Get token metadata, total/circulating supply, decimals, and holder count |
| 📜 **`solana_recent_activity`** | Fetch recent transactions for any wallet with human-readable summaries |
| 🎨 **`solana_nft_portfolio`** | List all NFTs in a wallet — collections, floor prices, and metadata |
| 🐋 **`whale_detector`** | Detect large transfers on Solana in real-time — configurable thresholds |
| 📊 **`solana_network_stats`** | Get current Solana network health, TPS, slot height, and epoch info |

---

## 🚀 Quick Start

### 1. Install

```bash
pip install hermes-blockchain-oracle
```

Or install from source:

```bash
git clone https://github.com/NousResearch/hermes-blockchain-oracle.git
cd hermes-blockchain-oracle
pip install -e .
```

### 2. Configure (Optional)

Set your preferred Solana RPC endpoint for best performance:

```bash
export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
```

> 💡 **Tip:** For production use, consider a dedicated RPC provider like [Helius](https://helius.dev), [QuickNode](https://quicknode.com), or [Triton](https://triton.one) for higher rate limits and reliability.

### 3. Launch with Hermes Agent

```bash
hermes-agent --mcp blockchain=hermes-blockchain-oracle
```

That's it. Hermes Agent now has full Solana blockchain awareness. 🧠⛓️

---

## 💬 Usage Examples

Once the oracle is connected, just talk to Hermes naturally:

### 🏦 Wallet Lookup
```
You: "Check the SOL balance of GsBd49...2kMp"
Hermes: That wallet holds 1,247.83 SOL (~$285,000 USD) along with 
        12 token holdings including 50,000 BONK and 2.4 JTO...
```

### 🔍 Transaction Investigation
```
You: "What happened in transaction 4sGjMW...x9Qv?"
Hermes: This transaction was a token swap on Jupiter Aggregator.
        2.5 SOL was swapped for 125,000 BONK. Fee: 0.000005 SOL.
        Status: Confirmed (finalized). Block: 248,391,042.
```

### 🐋 Whale Detection
```
You: "Are there any whale movements happening right now?"
Hermes: 🐋 Alert! Detected 3 large transfers in the last 10 minutes:
        • 50,000 SOL moved from Binance hot wallet → unknown wallet
        • 2.1M USDC transferred between two whale wallets
        • 180,000 JTO unstaked and moved to a fresh address
```

### 🎨 NFT Portfolio
```
You: "Show me what NFTs are in wallet Fxn7...kL9m"
Hermes: That wallet contains 23 NFTs across 5 collections:
        • Mad Lads (3) — Floor: 85 SOL
        • Tensorians (7) — Floor: 12 SOL
        • Claynosaurz (2) — Floor: 28 SOL
        ...
```

### 📊 Network Health
```
You: "How's the Solana network doing right now?"
Hermes: Solana is operating normally.
        • TPS: 3,847 (avg last 5 min)
        • Current Slot: 248,392,105
        • Epoch: 578 (63% complete)
        • Active Validators: 1,847
        • Network Version: 1.17.28
```

### 🪙 Token Research
```
You: "Tell me about the JTO token"
Hermes: Jito (JTO)
        • Mint: jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL
        • Supply: 1,000,000,000 (11.6% circulating)
        • Holders: 148,293
        • Decimals: 9
        • Description: Governance token for the Jito Network...
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      USER                               │
│              "Check this wallet..."                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  HERMES AGENT                           │
│           (Nous Research LLM Runtime)                   │
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │         Model Context Protocol (MCP)            │   │
│   │     Tool Discovery · Schema Negotiation         │   │
│   │      Request Routing · Response Formatting      │   │
│   └──────────────────────┬──────────────────────────┘   │
└──────────────────────────┼──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│            HERMES BLOCKCHAIN ORACLE                     │
│              (This MCP Server)                          │
│                                                         │
│   ┌───────────┐ ┌───────────┐ ┌───────────────────┐    │
│   │  Wallet   │ │   Token   │ │   Transaction     │    │
│   │  Tools    │ │   Tools   │ │   Tools           │    │
│   └─────┬─────┘ └─────┬─────┘ └────────┬──────────┘    │
│   ┌─────┴─────┐ ┌─────┴─────┐ ┌────────┴──────────┐    │
│   │   NFT     │ │   Whale   │ │   Network         │    │
│   │   Tools   │ │  Detector │ │   Stats           │    │
│   └─────┬─────┘ └─────┬─────┘ └────────┬──────────┘    │
│         └──────────────┼────────────────┘               │
└────────────────────────┼────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│               SOLANA BLOCKCHAIN                         │
│     RPC Nodes · Mainnet-Beta · On-Chain Programs        │
└─────────────────────────────────────────────────────────┘
```

### How MCP Integration Works

The **Model Context Protocol (MCP)** is a standardized interface that allows LLM agents to discover and invoke external tools. Here's the flow:

1. **Registration** — When Hermes Agent starts with `--mcp blockchain=hermes-blockchain-oracle`, the oracle registers its 7 tools with the agent, including full JSON schemas describing each tool's parameters and return types.

2. **Discovery** — Hermes Agent understands what tools are available and what they can do. When a user asks a blockchain-related question, the LLM autonomously decides which tool(s) to call.

3. **Invocation** — The agent constructs a structured tool call (e.g., `solana_wallet_info(address="GsBd49...")`) and sends it to the oracle server via the MCP transport layer.

4. **Execution** — The oracle queries the Solana RPC, processes the raw data, and returns a structured response.

5. **Synthesis** — Hermes Agent incorporates the on-chain data into a natural language response for the user.

This architecture means the oracle is **stateless**, **composable**, and **independently deployable** — upgrade the oracle without touching the agent, or swap in a different blockchain oracle entirely.

---

## 🔧 Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |
| `ORACLE_PORT` | `8420` | Port for the MCP server |
| `WHALE_THRESHOLD_SOL` | `1000` | Minimum SOL transfer to trigger whale alerts |
| `WHALE_THRESHOLD_USD` | `100000` | Minimum USD value to trigger whale alerts |
| `CACHE_TTL_SECONDS` | `30` | Cache duration for repeated queries |
| `LOG_LEVEL` | `INFO` | Logging verbosity (`DEBUG`, `INFO`, `WARN`, `ERROR`) |

---

## 🧪 Development

```bash
# Clone the repo
git clone https://github.com/NousResearch/hermes-blockchain-oracle.git
cd hermes-blockchain-oracle

# Create a virtual environment
python -m venv venv
source venv/bin/activate

# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/ -v

# Run the server standalone (for debugging)
python -m hermes_blockchain_oracle --debug

# Lint & format
ruff check .
ruff format .
```

---

## 🤝 Contributing

We welcome contributions from the community! Here's how to get involved:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feat/amazing-new-tool`)
3. **Write** tests for your changes
4. **Ensure** all tests pass (`pytest tests/ -v`)
5. **Lint** your code (`ruff check . && ruff format .`)
6. **Commit** with clear messages (`git commit -m "feat: add defi protocol analytics tool"`)
7. **Push** your branch and open a **Pull Request**

### Ideas for Contributions

- 🆕 New tools (DeFi protocol stats, staking info, program analytics)
- 🌐 Support for additional Solana programs (Marinade, Raydium, Orca, etc.)
- ⚡ Performance optimizations and caching improvements
- 📖 Documentation and usage examples
- 🧪 Test coverage expansion
- 🐛 Bug fixes and error handling improvements

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 Nous Research

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

<div align="center">

### Built with 🧠 by [Nous Research](https://nousresearch.com)

*Hermes sees all. On-chain and off.*

⭐ **Star this repo** if you find it useful — it helps us know what the community wants!

[Report Bug](https://github.com/NousResearch/hermes-blockchain-oracle/issues) · [Request Feature](https://github.com/NousResearch/hermes-blockchain-oracle/issues) · [Join Discord](https://discord.gg/nousresearch)

</div>
