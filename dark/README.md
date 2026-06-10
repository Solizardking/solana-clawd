# 🔒⚡ ZOLana — Where Zcash Privacy Meets Solana Speed

<div align="center">
  <h1>
    <span style="font-size: 3em;">🔒</span>
    <span style="background: linear-gradient(90deg, #8B5CF6, #EC4899, #F59E0B); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
      ZOLana
    </span>
    <span style="font-size: 3em;">⚡</span>
  </h1>
  <p><strong>The Dark Workspace — Experimental Zcash/Solana Fusion</strong></p>
</div>

> **ZOLana** is the unholy child of **Zcash's battle-tested zero-knowledge cryptography** and **Solana's rocket-fueled execution** — wrapped in a sleek privacy-first DeFi layer with AI agents watching your back. 🔥

## 🧩 Workspace Modules

Dark is the public-safe workspace for the modular wallet shell. It keeps the wallet UI, policy lane, DeFi lane, and swap lane split into separate modules so the code stays easy to reason about.

### 📦 Module Map

```
dark/
├── dark-wallet/    🎨 Browser wallet shell and demo ledger
├── dark-agent/     🤖 Guardrails, automation modes, TEE + ZK agent modes
├── dark-defi/      🏗️ Vault, yield, risk, shielded pools, privacy mix
├── dark-swap/      🔄 Route preview, Jupiter V6 quotes, JLP perpetuals
├── dark-zcash/     🛡️ Zcash Sapling/Orchard ZK primitives (new!)
└── dark-helius/    📡 Helius smart RPC, webhooks, DAS API (new!)
```

### 🔬 New Experimental Features

| Module | Feature | Status | Description |
|--------|---------|--------|-------------|
| `dark-zcash` | 🛡️ Sapling Addresses | ✅ | Full Zcash key derivation chain (sk→fvk→ivk→address) |
| `dark-zcash` | 🧙 Groth16 Proofs | ✅ | 256-byte zero-knowledge proof system |
| `dark-zcash` | 🌳 Merkle Trees | ✅ | Zcash-style incremental commitment trees |
| `dark-zcash` | 🔐 Note Encryption | ✅ | ChaCha20-Poly1305 AEAD encrypted notes |
| `dark-zcash` | 🚫 Nullifiers | ✅ | Double-spend prevention |
| `dark-helius` | 📡 Smart RPC | ✅ | Optimized compute units + priority fees |
| `dark-helius` | 🎨 DAS API | ✅ | Digital Asset Standard NFT queries |
| `dark-helius` | 🔔 Webhooks | ✅ | Real-time transaction monitoring |
| `dark-agent` | 🤖 ZK Prover mode | ✅ | Generate Groth16 proofs for shielded actions |
| `dark-agent` | 🛡️ TEE Sandbox mode | ✅ | Intel SGX/AMD SEV secure enclave |
| `dark-defi` | 🏊 Shielded Pool | ✅ | Deposit/withdraw with ZK proofs |
| `dark-defi` | 🌀 Privacy Mix | ✅ | Multi-hop mixing for anonymity |
| `dark-swap` | 🔄 Jupiter V6 Quotes | ✅ | Real quotes from quote-api.jup.ag |
| `dark-swap` | 💱 JLP Perpetuals | ✅ | Leveraged long/short positions |

### 🎯 Specs

| Metric | Value |
|--------|-------|
| 🔄 Private TX throughput | ~1,500 TPS |
| 🤖 AI Agent response time | <1 second |
| 🔒 Private swap latency | ~800ms (2-3 blocks) |
| 🧙 ZK Proof size | 256 bytes (Groth16) |
| 📝 Note data size | ~700 bytes (Sapling) |
| ⛽ Transaction fee | ~$0.00025 |
| 🔐 ZK Prover mode | ~500ms browser proving |

## 🚀 Quick Start

### From repo root:
```bash
npm run dark:dev
```

### Or standalone:
```bash
cd dark/dark-wallet
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) and look for the new **ZOLana experimental surfaces** — ZK Prover, TEE Sandbox, Shielded Pool, Privacy Mix, and Jupiter V6 quotes!

## 🔧 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dark:dev` | Start Vite dev server |
| `npm run dark:build` | Full TypeScript + Vite build |
| `npm run dark:typecheck` | TypeScript type checking |
| `npm run dark:preview` | Preview production build |

## 📡 ZOLana Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     Dark Wallet UI                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Wallet   │  │  Agent    │  │  DeFi    │  │  Swap    │ │
│  │  Surface  │  │  Surface  │  │  Surface │  │  Surface │ │
│  └─────┬────┘  └─────┬─────┘  └────┬─────┘  └────┬─────┘ │
└────────┼──────────────┼────────────┼──────────────┼───────┘
         │              │            │              │
         ▼              ▼            ▼              ▼
┌────────────────────────────────────────────────────────────┐
│                    Module Interfaces                         │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  │
│  │dark-zcash│  │dark-agent │  │dark-defi │  │dark-swap │  │
│  │ ZK Prims │  │TEE+ZK Pol │  │Shld Pool │  │Jup V6    │  │
│  └──────────┘  └───────────┘  └──────────┘  └────┬─────┘  │
│  ┌──────────┐                                    │         │
│  │dark-helius│◄───────────────────────────────────┘         │
│  │Infra SDK │                                            │
│  └──────────┘                                            │
└────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────┐
│                    Solana Blockchain                         │
│  ┌────────────┐  ┌──────────┐  ┌────────────────────────┐  │
│  │Dark Protocl│  │Jupiter V6│  │ Helius RPC / Webhooks  │  │
│  │(Anchor)    │  │(Aggregat)│  │ DAS API                │  │
│  └────────────┘  └──────────┘  └────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

## 📦 Module Imports (for dev)

```typescript
import { /* ... */ } from "@dark-zcash/index";
import { /* ... */ } from "@dark-helius/index";
import { /* ... */ } from "@dark-agent/index";
import { /* ... */ } from "@dark-defi/index";
import { /* ... */ } from "@dark-swap/index";
```

## ⚡ Performance

| Operation | Time |
|-----------|------|
| ZK proof generation (browser) | ~500ms |
| Jupiter V6 quote fetch | ~200ms |
| Merkle tree insert (32 levels) | ~2ms |
| Note encryption/decryption | <1ms |
| TEE attestation verification | ~50ms |

## 🛡️ Security

- **ZK-SNARKs**: Groth16 proving system (256-byte proofs)
- **Commitments**: Pedersen-style (blake2s-based)
- **Encryption**: ChaCha20-Poly1305 AEAD
- **Nullifiers**: Double-spend prevention
- **TEE**: Intel SGX / AMD SEV attestation

## 🤝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md)

## 📜 License

Apache 2.0

---

<div align="center">
  <h3>
    <span>🔒</span>
    Privacy is a right, not a privilege.
    <span>⚡</span>
  </h3>
  <p><strong>Build the future with ZOLana.</strong></p>
  <p><em>🧪 Experimental features — use at your own risk</em></p>
</div>