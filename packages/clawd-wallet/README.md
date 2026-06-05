# @openclawd/wallet — Clawd Wallet

**Privy-powered embedded Solana wallet for the openclawd agent ecosystem.**

- Private keys never leave Privy's secure TEE — not your server, not your app
- Built-in Jupiter DEX integration for swap execution
- Grok 4.20 Beta as the AI reasoning layer for transaction pre-screening
- Deny-first permissions: the agent must ask before spending

---

## Install

```bash
npm install @openclawd/wallet
# React: npm install @openclawd/wallet react react-dom
```

---

## Quick Start

### React

```tsx
import { PrivyProvider, useClawdWallet } from "@openclawd/wallet/react";

export default function App() {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      loginMethods={["google", "discord"]}
      embeddedWallets
    >
      <SwapButton />
    </PrivyProvider>
  );
}

function SwapButton() {
  const { wallet, authenticated, connectWallet } = useClawdWallet();

  if (!wallet) {
    return <button onClick={connectWallet}>Connect Clawd Wallet</button>;
  }

  return (
    <div>
      <span>{wallet.address.slice(0, 8)}...{wallet.address.slice(-4)}</span>
      <span>{wallet.ready ? "✅ Ready" : "⏳ Loading..."}</span>
    </div>
  );
}
```

### Node.js / CLI

```bash
npm install -g @openclawd/wallet
clawd-wallet tokens
clawd-wallet quote SOL USDC 0.1
clawd-wallet balance 7EYj9...Abc
```

### Programmatic swap

```ts
import { ClawdWallet, SwapService } from "@openclawd/wallet";

// Wrap a Privy wallet
const wallet = new ClawdWallet(privyWallet, { chain: "mainnet" });

const swap = new SwapService();
const quote = await swap.quote({
  inputToken: "SOL",
  outputToken: "USDC",
  amount: "1000000000", // 1 SOL in lamports
  slippageBps: 50,
});

const result = await swap.execute(wallet, { ...quote });
console.log(result.explorerUrl);
```

---

## Architecture

```
User → Grok 4.20 Beta → ClawdWallet (Privy TEE) → Solana blockchain
                                    ↓
                         ┌─── allow ───→ auto-sign
                         ├─── ask ──────→ Grok screens + user prompt
                         └─── deny ─────→ always block
```

### Permissions model

| Action        | `deny`        | `ask` (default)                            | `allow`          |
|---------------|---------------|--------------------------------------------|------------------|
| Swap          | always block  | Grok screens → user confirms               | auto up to $50   |
| Transfer SOL  | always block  | Grok screens → user confirms               | auto up to 0.1 SOL |
| Sign message  | always block  | always block                               | never            |

### Token support

Built-in mints for top tokens. Custom mints via address:

```ts
// Symbol shortcut
swap.quote({ inputToken: "SOL", outputToken: "USDC", ... });

// Mint address
swap.quote({ inputToken: "So1111...", outputToken: "EPjFW...", ... });
```

---

## CLI Reference

```bash
clawd-wallet info                        # Show setup instructions
clawd-wallet tokens                      # List top tokens on Jupiter
clawd-wallet quote <in> <out> <amt>     # Get quote (no execution)
clawd-wallet swap <in> <out> <amt>      # Execute swap (needs wallet)
clawd-wallet balance <address>           # Check SOL balance
```

---

## Server-side / Agentic trading

```ts
import { AgenticWallet, DEFAULT_PERMISSIONS } from "@openclawd/wallet";

const agent = new AgenticWallet(wallet, {
  privyAppId: process.env.PRIVY_APP_ID!,
  grokApiKey: process.env.XAI_API_KEY,
  permissions: {
    ...DEFAULT_PERMISSIONS,
    swap: "ask",      // agent asks before each swap
    maxSwapUsd: 100,  // up to $100 per swap
  },
  onTransactionStatus: (tx) => {
    console.log(`[${tx.status}] ${tx.description}`);
  },
});

// Agent decides to swap
const { signature, explorerUrl } = await agent.agentSwap({
  inputToken: "SOL",
  outputToken: "USDC",
  amount: "1000000000",
  slippageBps: 50,
});

console.log(`Confirmed: ${explorerUrl}`);
```

---

## Environment variables

| Variable         | Required | Description                         |
|------------------|----------|-------------------------------------|
| `PRIVY_APP_ID`   | ✅       | From [dashboard.privy.io](https://dashboard.privy.io) |
| `XAI_API_KEY`    | For AI screening | From [console.x.ai](https://console.x.ai) |
| `SOLANA_RPC_URL` | No       | Defaults to public Helius RPC       |

---

## License

MIT — See [`../../LICENSE.md`](../../LICENSE.md)
